import { createHash } from 'node:crypto'
import Stripe from 'stripe'
import {
  BillingGatewayError,
  type BillingRepository,
  type LocalSubscriptionStatus,
} from '../../application/ports/billing.js'
import type { ActorContext } from '../../application/ports/identity.js'
import { billingPlanByKey, BILLING_PLAN_CATALOG, type BillingPlanCatalogItem } from '../../billingCatalog.js'
import type { StripeBillingConfiguration } from '../../config.js'
import type {
  BillingCancellationConfirmation,
  BillingOverview,
  BillingPortalGateway,
  BillingSubscriptionSummary,
} from '../../interfaces/http/fastify/routes/billing.js'

const REFUND_POLICY = 'Consulte a Política de Cancelamento e Reembolso aplicável; direitos legais permanecem preservados.'

export class StripeBillingGateway implements BillingPortalGateway {
  readonly checkoutEnabled: boolean

  private constructor(
    private readonly stripe: Stripe,
    private readonly repository: BillingRepository,
    private readonly config: StripeBillingConfiguration,
  ) {
    this.checkoutEnabled = config.checkoutEnabled
  }

  static async create(repository: BillingRepository, config: StripeBillingConfiguration) {
    const stripe = new Stripe(config.secretKey, {
      maxNetworkRetries: 2,
      timeout: 10_000,
      appInfo: { name: 'BetIntel AI', version: '0.1.0' },
    })
    const gateway = new StripeBillingGateway(stripe, repository, config)
    await gateway.validatePriceCatalog()
    return gateway
  }

  async createCheckout(actor: ActorContext, planKey: string, idempotencyKey: string) {
    if (!this.checkoutEnabled) {
      throw new BillingGatewayError('checkout_disabled', 'Novas assinaturas estão temporariamente desabilitadas.')
    }
    const plan = requiredPlan(planKey)
    const current = await this.repository.getCurrentSubscription(actor)
    if (current && current.status !== 'incomplete') {
      throw new BillingGatewayError('subscription_already_exists', 'A organização já possui assinatura. Use o portal para alterá-la.')
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: actor.organizationId,
      customer: current?.providerCustomerId,
      line_items: [{ price: this.config.priceIds[plan.planKey], quantity: 1 }],
      success_url: `${this.config.appUrl}/?view=billing&checkout=success`,
      cancel_url: `${this.config.appUrl}/?view=billing&checkout=cancelled`,
      locale: 'pt-BR',
      automatic_tax: { enabled: this.config.automaticTax },
      tax_id_collection: { enabled: true },
      metadata: {
        organization_id: actor.organizationId,
        plan_key: plan.planKey,
        approval_reference: this.config.approvalReference,
      },
      subscription_data: {
        metadata: {
          organization_id: actor.organizationId,
          plan_key: plan.planKey,
        },
      },
    }, { idempotencyKey })
    if (!session.url) throw new Error('stripe_checkout_url_missing')
    return { url: session.url, expiresAt: fromUnix(session.expires_at) }
  }

  async createPortal(actor: ActorContext, idempotencyKey: string) {
    const current = await this.requiredCurrentSubscription(actor)
    const session = await this.stripe.billingPortal.sessions.create({
      customer: current.providerCustomerId,
      return_url: `${this.config.appUrl}/?view=billing`,
      configuration: this.config.portalConfigurationId,
      locale: 'pt-BR',
    }, { idempotencyKey })
    return {
      url: session.url,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    }
  }

  async getOverview(actor: ActorContext): Promise<BillingOverview> {
    const overview = await this.repository.getOverview(actor)
    return {
      plans: [],
      subscription: overview.subscription ? subscriptionSummary(overview.subscription) : null,
      usage: overview.usage,
      invoices: overview.invoices,
    }
  }

  async getSubscription(actor: ActorContext) {
    const subscription = await this.repository.getCurrentSubscription(actor)
    return subscription ? subscriptionSummary(subscription) : null
  }

  async cancelSubscription(actor: ActorContext, idempotencyKey: string): Promise<BillingCancellationConfirmation> {
    const current = await this.requiredCurrentSubscription(actor)
    const subscription = await this.stripe.subscriptions.update(
      current.providerSubscriptionId,
      { cancel_at_period_end: true },
      { idempotencyKey },
    )
    await this.syncSubscription(subscription)
    return {
      planName: current.planName,
      requestedAt: new Date().toISOString(),
      accessUntil: periodOf(subscription).end,
      refundPolicy: REFUND_POLICY,
      dataEffects: 'O cancelamento interrompe a renovação; retenção e exclusão de dados seguem a Política de Privacidade.',
      canReactivate: true,
      notificationStatus: 'not_configured',
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret, 300)
  }

  async processWebhook(rawBody: Buffer, signature: string) {
    const event = this.verifyWebhook(rawBody, signature)
    const receipt = await this.repository.beginWebhook({
      providerEventId: event.id,
      eventType: event.type,
      payloadSha256: createHash('sha256').update(rawBody).digest('hex'),
      occurredAt: fromUnix(event.created),
    })
    if (!receipt.process) return { duplicate: true }

    try {
      if (event.type === 'checkout.session.completed') {
        const subscriptionId = idOf(event.data.object.subscription)
        if (subscriptionId) await this.syncSubscription(await this.stripe.subscriptions.retrieve(subscriptionId))
      } else if (
        event.type === 'customer.subscription.created'
        || event.type === 'customer.subscription.updated'
        || event.type === 'customer.subscription.deleted'
        || event.type === 'customer.subscription.paused'
        || event.type === 'customer.subscription.resumed'
      ) {
        await this.syncSubscription(event.data.object)
      } else if (event.type.startsWith('invoice.')) {
        await this.syncInvoice(event.data.object as Stripe.Invoice)
      }
      await this.repository.completeWebhook(event.id)
      return { duplicate: false }
    } catch (error) {
      await this.repository.failWebhook(event.id, failureCode(error))
      throw error
    }
  }

  private async syncSubscription(subscription: Stripe.Subscription) {
    const organizationId = subscription.metadata.organization_id
    const plan = this.planForSubscription(subscription)
    if (!organizationId || !isUuid(organizationId)) throw new Error('stripe_subscription_organization_missing')
    const customerId = idOf(subscription.customer)
    if (!customerId) throw new Error('stripe_subscription_customer_missing')
    const period = periodOf(subscription)
    await this.repository.upsertSubscription({
      organizationId,
      plan: {
        planKey: plan.planKey,
        name: plan.name,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        interval: plan.interval,
        entitlements: plan.entitlements,
      },
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      status: localStatus(subscription.status),
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? fromUnix(subscription.canceled_at) : undefined,
    })
  }

  private async syncInvoice(invoice: Stripe.Invoice) {
    const legacyInvoice = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null }
    const subscriptionId = idOf(
      invoice.parent?.subscription_details?.subscription ?? legacyInvoice.subscription,
    )
    if (!subscriptionId || !invoice.status) return
    // Invoice delivery can race subscription delivery. Retrieving first makes
    // reconciliation order-independent and keeps the local row authoritative.
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId)
    await this.syncSubscription(subscription)
    const organizationId = subscription.metadata.organization_id
    if (!organizationId || !isUuid(organizationId)) throw new Error('stripe_subscription_organization_missing')
    await this.repository.upsertInvoice({
      organizationId,
      providerInvoiceId: invoice.id,
      providerSubscriptionId: subscriptionId,
      status: invoice.status,
      currency: invoice.currency.toUpperCase(),
      amountDueMinor: invoice.amount_due,
      amountPaidMinor: invoice.amount_paid,
      dueAt: invoice.due_date ? fromUnix(invoice.due_date) : undefined,
      paidAt: invoice.status_transitions.paid_at ? fromUnix(invoice.status_transitions.paid_at) : undefined,
      createdAt: fromUnix(invoice.created),
    })
  }

  private async requiredCurrentSubscription(actor: ActorContext) {
    const current = await this.repository.getCurrentSubscription(actor)
    if (!current) throw new BillingGatewayError('subscription_not_found', 'Nenhuma assinatura foi encontrada para a organização.')
    return current
  }

  private async validatePriceCatalog() {
    const entries = await Promise.all(BILLING_PLAN_CATALOG.map(async (plan) => ({
      plan,
      price: await this.stripe.prices.retrieve(this.config.priceIds[plan.planKey]),
    })))
    for (const { plan, price } of entries) {
      if (!price.active || price.currency.toUpperCase() !== plan.currency
        || price.unit_amount !== plan.priceMinor || price.recurring?.interval !== plan.interval) {
        throw new Error(`Stripe Price incompatível com o catálogo server-side: ${plan.planKey}.`)
      }
    }
  }

  private planForSubscription(subscription: Stripe.Subscription) {
    const priceId = subscription.items.data[0]?.price.id
    const configured = Object.entries(this.config.priceIds)
      .find(([, configuredPriceId]) => configuredPriceId === priceId)?.[0]
    if (!configured) throw new Error('stripe_subscription_price_unknown')
    return requiredPlan(configured)
  }
}

function requiredPlan(planKey: string | undefined): BillingPlanCatalogItem {
  const plan = planKey ? billingPlanByKey(planKey) : undefined
  if (!plan) throw new BillingGatewayError('invalid_plan', 'Plano Stripe ausente ou não reconhecido.')
  return plan
}

function subscriptionSummary(subscription: {
  planName: string
  status: string
  priceMinor: number
  currency: string
  interval: 'month' | 'year'
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}): BillingSubscriptionSummary {
  return {
    planName: subscription.planName,
    status: subscription.status,
    priceMinor: subscription.priceMinor,
    currency: subscription.currency,
    interval: subscription.interval,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    refundPolicy: REFUND_POLICY,
  }
}

function periodOf(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  const legacy = subscription as Stripe.Subscription & {
    current_period_start?: number
    current_period_end?: number
  }
  const start = item?.current_period_start ?? legacy.current_period_start
  const end = item?.current_period_end ?? legacy.current_period_end
  if (!start || !end || end <= start) {
    throw new Error('stripe_subscription_period_missing')
  }
  return { start: fromUnix(start), end: fromUnix(end) }
}

function localStatus(status: Stripe.Subscription.Status): LocalSubscriptionStatus {
  if (status === 'incomplete_expired') return 'incomplete'
  if (status === 'unpaid') return 'past_due'
  return status
}

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id
}

function fromUnix(value: number) {
  return new Date(value * 1000).toISOString()
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function failureCode(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return `stripe_${error.type}`.slice(0, 100)
  if (error instanceof Error && /^[a-z0-9_]{1,100}$/i.test(error.message)) return error.message
  return 'billing_webhook_processing_failed'
}
