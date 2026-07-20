import { and, desc, eq, inArray } from 'drizzle-orm'
import type {
  BillingInvoiceWrite,
  BillingRepository,
  BillingRepositoryOverview,
  BillingSubscriptionRecord,
  BillingSubscriptionWrite,
} from '../../application/ports/billing.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type { BetIntelDatabase } from './client.js'
import { invoices, plans, subscriptions, usageRecords, webhookEvents } from './schema.js'
import { applyActorContext, applyOrganizationContext } from './tenantContext.js'

const CURRENT_STATUSES = ['trialing', 'active', 'past_due', 'paused', 'incomplete'] as const

export class PostgresBillingRepository implements BillingRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async getOverview(actor: ActorContext): Promise<BillingRepositoryOverview> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const [subscriptionRows, usageRows, invoiceRows] = await Promise.all([
        tx.select({ subscription: subscriptions, plan: plans })
          .from(subscriptions)
          .innerJoin(plans, eq(subscriptions.planId, plans.id))
          .where(and(
            eq(subscriptions.organizationId, actor.organizationId),
            inArray(subscriptions.status, [...CURRENT_STATUSES]),
          ))
          .orderBy(desc(subscriptions.updatedAt))
          .limit(1),
        tx.select().from(usageRecords)
          .where(eq(usageRecords.organizationId, actor.organizationId))
          .orderBy(desc(usageRecords.periodStart))
          .limit(50),
        tx.select().from(invoices)
          .where(eq(invoices.organizationId, actor.organizationId))
          .orderBy(desc(invoices.createdAt))
          .limit(24),
      ])

      return {
        subscription: subscriptionRows[0]
          ? mapSubscription(subscriptionRows[0].subscription, subscriptionRows[0].plan)
          : null,
        usage: usageRows.map((row) => ({
          metric: row.metric,
          quantity: row.quantity,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
        })),
        invoices: invoiceRows.map((row) => ({
          id: row.id,
          status: row.status,
          currency: row.currency,
          amountDueMinor: row.amountDueMinor,
          amountPaidMinor: row.amountPaidMinor,
          dueAt: row.dueAt ?? undefined,
          paidAt: row.paidAt ?? undefined,
          createdAt: row.createdAt,
        })),
      }
    })
  }

  async getCurrentSubscription(actor: ActorContext) {
    return (await this.getOverview(actor)).subscription
  }

  async upsertSubscription(input: BillingSubscriptionWrite): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyOrganizationContext(tx, input.organizationId)
      const planRows = await tx.insert(plans).values({
        planKey: input.plan.planKey,
        name: input.plan.name,
        priceMinor: input.plan.priceMinor,
        currency: input.plan.currency,
        interval: input.plan.interval,
        entitlements: input.plan.entitlements,
        active: true,
      }).onConflictDoUpdate({
        target: plans.planKey,
        set: {
          name: input.plan.name,
          priceMinor: input.plan.priceMinor,
          currency: input.plan.currency,
          interval: input.plan.interval,
          entitlements: input.plan.entitlements,
          active: true,
        },
      }).returning({ id: plans.id })

      await tx.insert(subscriptions).values({
        organizationId: input.organizationId,
        planId: planRows[0].id,
        provider: 'stripe',
        providerCustomerId: input.providerCustomerId,
        providerSubscriptionId: input.providerSubscriptionId,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        canceledAt: input.canceledAt,
      }).onConflictDoUpdate({
        target: [subscriptions.provider, subscriptions.providerSubscriptionId],
        set: {
          planId: planRows[0].id,
          providerCustomerId: input.providerCustomerId,
          status: input.status,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          canceledAt: input.canceledAt,
        },
      })
    })
  }

  async upsertInvoice(input: BillingInvoiceWrite): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyOrganizationContext(tx, input.organizationId)
      const subscriptionRows = await tx.select({
        id: subscriptions.id,
        organizationId: subscriptions.organizationId,
      }).from(subscriptions).where(and(
        eq(subscriptions.provider, 'stripe'),
        eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId),
      )).limit(1)
      const subscription = subscriptionRows[0]
      if (!subscription) throw new Error('billing_subscription_not_reconciled')
      if (subscription.organizationId !== input.organizationId) {
        throw new Error('billing_invoice_organization_mismatch')
      }
      await tx.insert(invoices).values({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        provider: 'stripe',
        providerInvoiceId: input.providerInvoiceId,
        status: input.status,
        currency: input.currency,
        amountDueMinor: input.amountDueMinor,
        amountPaidMinor: input.amountPaidMinor,
        dueAt: input.dueAt,
        paidAt: input.paidAt,
        createdAt: input.createdAt,
      }).onConflictDoUpdate({
        target: [invoices.provider, invoices.providerInvoiceId],
        set: {
          subscriptionId: subscription.id,
          status: input.status,
          currency: input.currency,
          amountDueMinor: input.amountDueMinor,
          amountPaidMinor: input.amountPaidMinor,
          dueAt: input.dueAt,
          paidAt: input.paidAt,
        },
      })
    })
  }

  async beginWebhook(input: {
    providerEventId: string
    eventType: string
    payloadSha256: string
    occurredAt?: string
  }) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.insert(webhookEvents).values({
        provider: 'stripe',
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        payloadSha256: input.payloadSha256,
        occurredAt: input.occurredAt,
        status: 'processing',
      }).onConflictDoNothing().returning({ status: webhookEvents.status })
      if (inserted[0]) return { process: true, status: inserted[0].status }

      const existingRows = await tx.select().from(webhookEvents).where(and(
        eq(webhookEvents.provider, 'stripe'),
        eq(webhookEvents.providerEventId, input.providerEventId),
      )).limit(1)
      const existing = existingRows[0]
      if (!existing || existing.payloadSha256 !== input.payloadSha256) {
        throw new Error('stripe_webhook_replay_mismatch')
      }
      if (existing.status === 'processed' || existing.status === 'processing') {
        return { process: false, status: existing.status }
      }
      await tx.update(webhookEvents).set({ status: 'processing', failureCode: null })
        .where(eq(webhookEvents.id, existing.id))
      return { process: true, status: 'processing' as const }
    })
  }

  async completeWebhook(providerEventId: string): Promise<void> {
    await this.db.update(webhookEvents).set({
      status: 'processed',
      processedAt: new Date().toISOString(),
      failureCode: null,
    }).where(and(
      eq(webhookEvents.provider, 'stripe'),
      eq(webhookEvents.providerEventId, providerEventId),
    ))
  }

  async failWebhook(providerEventId: string, failureCode: string): Promise<void> {
    await this.db.update(webhookEvents).set({
      status: 'failed',
      failureCode: failureCode.slice(0, 100),
    }).where(and(
      eq(webhookEvents.provider, 'stripe'),
      eq(webhookEvents.providerEventId, providerEventId),
    ))
  }
}

function mapSubscription(
  row: typeof subscriptions.$inferSelect,
  plan: typeof plans.$inferSelect,
): BillingSubscriptionRecord {
  return {
    planKey: plan.planKey,
    planName: plan.name,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    interval: plan.interval,
    providerCustomerId: row.providerCustomerId,
    providerSubscriptionId: row.providerSubscriptionId,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt ?? undefined,
  }
}
