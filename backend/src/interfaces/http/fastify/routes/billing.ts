import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { ActorContext } from '../../../../application/ports/identity.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { IdempotencyHeadersSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'
import { billingPlanByKey, publicBillingPlans } from '../../../../billingCatalog.js'
import type { LegalRepository } from '../../../../application/ports/legal.js'
import { hashRemoteAddress } from '../plugins/authentication.js'
import { BillingGatewayError } from '../../../../application/ports/billing.js'

export interface BillingPortalGateway {
  readonly checkoutEnabled?: boolean
  createPortal(actor: ActorContext, idempotencyKey: string): Promise<{ url: string; expiresAt: string }>
  createCheckout?(
    actor: ActorContext,
    planKey: string,
    idempotencyKey: string,
  ): Promise<{ url: string; expiresAt: string }>
  getOverview?(actor: ActorContext): Promise<BillingOverview>
  getSubscription?(actor: ActorContext): Promise<BillingSubscriptionSummary | null>
  cancelSubscription?(
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<BillingCancellationConfirmation>
}

export interface BillingOverview {
  plans: Array<{
    planKey: string
    productKey: string
    name: string
    description: string
    priceMinor: number
    monthlyEquivalentMinor: number
    savingsMinor: number
    currency: string
    interval: 'month' | 'year'
    recommended: boolean
    features: string[]
    entitlements: Record<string, unknown>
  }>
  subscription: BillingSubscriptionSummary | null
  usage: Array<{ metric: string; quantity: number; limit?: number; periodStart: string; periodEnd: string }>
  invoices: Array<{
    id: string
    status: string
    currency: string
    amountDueMinor: number
    amountPaidMinor: number
    dueAt?: string
    paidAt?: string
    createdAt: string
  }>
}

export interface BillingSubscriptionSummary {
  planName: string
  status: string
  priceMinor: number
  currency: string
  interval: 'month' | 'year'
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  refundPolicy: string
}

export interface BillingCancellationConfirmation {
  planName: string
  requestedAt: string
  accessUntil: string
  refundPolicy: string
  dataEffects: string
  canReactivate: boolean
  notificationStatus: 'sent' | 'not_configured' | 'failed'
}

export const billingRoutes: FastifyPluginAsyncTypebox<{
  billingPortal?: BillingPortalGateway
  legal: LegalRepository
  requestIpHashKey: string
}> = async (app, { billingPortal, legal, requestIpHashKey }) => {
  app.get('/billing/subscription', {
    config: { permission: 'private.read' },
    schema: {
      tags: ['billing'], security: [{ bearerAuth: [] }],
      response: {
        200: Type.Object({
          configured: Type.Boolean(),
          subscription: Type.Union([Type.Null(), Type.Object({}, { additionalProperties: true })]),
        }),
        default: ProblemSchema,
      },
    },
  }, async (request) => ({
    configured: Boolean(billingPortal?.getSubscription && billingPortal?.cancelSubscription),
    subscription: billingPortal?.getSubscription
      ? await billingPortal.getSubscription(actorFrom(request))
      : null,
  }))

  app.post('/billing/portal', {
    config: { permission: 'private.read' },
    schema: {
      tags: ['billing'], security: [{ bearerAuth: [] }], headers: IdempotencyHeadersSchema,
      response: {
        201: Type.Object({ url: Type.String(), expiresAt: Type.String() }),
        default: ProblemSchema,
      },
    },
  }, async (request, reply) => {
    requireBillingOwner(actorFrom(request))
    if (!billingPortal) {
      throw new ApiError(
        503,
        'billing_not_configured',
        'Portal de cobrança indisponível enquanto os gates comercial e jurídico não forem aprovados.',
      )
    }
    const portal = await billingPortal.createPortal(
      actorFrom(request),
      String(request.headers['idempotency-key']),
    )
    return reply.code(201).send(portal)
  })

  app.get('/billing/overview', {
    config: { permission: 'private.read' },
    schema: {
      tags: ['billing'], security: [{ bearerAuth: [] }],
      response: {
        200: Type.Object({ configured: Type.Boolean(), overview: Type.Union([Type.Null(), Type.Object({}, { additionalProperties: true })]) }),
        default: ProblemSchema,
      },
    },
  }, async (request) => {
    const providerOverview = billingPortal?.getOverview
      ? await billingPortal.getOverview(actorFrom(request))
      : null
    return {
      configured: Boolean(billingPortal?.createCheckout && billingPortal.checkoutEnabled !== false),
      overview: {
        plans: publicBillingPlans(),
        subscription: providerOverview?.subscription ?? null,
        usage: providerOverview?.usage ?? [],
        invoices: providerOverview?.invoices ?? [],
      },
    }
  })

  app.post('/billing/checkout', {
    config: { permission: 'private.write' },
    schema: {
      tags: ['billing'], security: [{ bearerAuth: [] }], headers: IdempotencyHeadersSchema,
      body: Type.Object({
        planKey: Type.String({ minLength: 1, maxLength: 100 }),
        recurringBillingAccepted: Type.Literal(true),
      }, { additionalProperties: false }),
      response: { 201: Type.Object({ url: Type.String(), expiresAt: Type.String() }), default: ProblemSchema },
    },
  }, async (request, reply) => {
    const actor = actorFrom(request)
    requireBillingOwner(actor)
    const plan = billingPlanByKey(request.body.planKey)
    if (!plan) {
      throw new ApiError(400, 'invalid_plan', 'Plano inexistente ou indisponivel para contratacao.')
    }
    if (!billingPortal?.createCheckout || billingPortal.checkoutEnabled === false) {
      throw new ApiError(503, 'billing_not_configured', 'Checkout indisponivel enquanto o gateway e os gates comercial e juridico nao estiverem ativos.')
    }
    const idempotencyKey = String(request.headers['idempotency-key'])
    const legalStatus = await legal.acceptanceStatus(actor)
    const privacy = legalStatus.requiredDocuments.find((document) => document.type === 'privacy')
    const risk = legalStatus.requiredDocuments.find((document) => document.type === 'risk')
    if (!privacy || !risk || legalStatus.requiredDocuments.length < 3) {
      throw new ApiError(503, 'legal_documents_unavailable', 'Documentos jurídicos ativos não estão disponíveis para registrar a assinatura.')
    }
    const acceptances = await legal.recordAcceptances(actor, {
      purpose: 'subscription',
      idempotencyKey,
      documents: legalStatus.requiredDocuments.map(({ type, version, contentHash }) => ({ type, version, contentHash })),
      declarations: {
        age18: true,
        termsAndPrivacy: true,
        risk: true,
        recurringBilling: request.body.recurringBillingAccepted,
      },
      evidence: {
        origin: 'subscription',
        ipHash: hashRemoteAddress(request.ip, requestIpHashKey),
        userAgent: headerValue(request.headers['user-agent']),
        planKey: plan.planKey,
        billingCycle: plan.interval,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        transactionId: idempotencyKey,
        riskVersion: risk.version,
        privacyVersion: privacy.version,
      },
    })
    if (acceptances.length !== legalStatus.requiredDocuments.length) {
      throw new ApiError(503, 'legal_acceptance_failed', 'Não foi possível registrar integralmente o aceite da assinatura.')
    }
    let checkout: { url: string; expiresAt: string }
    try {
      checkout = await billingPortal.createCheckout(actor, plan.planKey, idempotencyKey)
    } catch (error) {
      if (error instanceof BillingGatewayError) {
        throw new ApiError(error.code === 'invalid_plan' ? 400 : 409, error.code, error.message)
      }
      throw error
    }
    return reply.code(201).send(checkout)
  })

  app.post('/billing/subscription/cancel', {
    config: { permission: 'private.write' },
    schema: {
      tags: ['billing'], security: [{ bearerAuth: [] }], headers: IdempotencyHeadersSchema,
      response: {
        200: Type.Object({
          confirmation: Type.String(),
          cancellation: Type.Object({}, { additionalProperties: true }),
        }),
        default: ProblemSchema,
      },
    },
  }, async (request) => {
    requireBillingOwner(actorFrom(request))
    if (!billingPortal?.cancelSubscription) {
      throw new ApiError(
        503,
        'billing_not_configured',
        'Cancelamento indisponível porque não existe assinatura nem gateway de pagamento ativo.',
      )
    }
    const cancellation = await billingPortal.cancelSubscription(
      actorFrom(request),
      String(request.headers['idempotency-key']),
    )
    return {
      confirmation: `Sua solicitação de cancelamento foi registrada. A renovação automática foi interrompida. Salvo informação diferente decorrente da política aplicável ou de direito legal, o acesso permanecerá disponível até ${cancellation.accessUntil}. Esta confirmação não impede a análise de cobranças indevidas, duplicadas ou de outros direitos previstos em lei.`,
      cancellation,
    }
  })
}

function requireBillingOwner(actor: ActorContext) {
  if (actor.role !== 'owner') {
    throw new ApiError(403, 'forbidden', 'Somente o proprietário da organização pode alterar a assinatura.')
  }
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
