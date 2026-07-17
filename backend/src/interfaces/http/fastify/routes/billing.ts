import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { ActorContext } from '../../../../application/ports/identity.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { IdempotencyHeadersSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'
import { billingPlanByKey, publicBillingPlans } from '../../../../billingCatalog.js'

export interface BillingPortalGateway {
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
}> = async (app, { billingPortal }) => {
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
      configured: Boolean(billingPortal?.createCheckout),
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
      body: Type.Object({ planKey: Type.String({ minLength: 1, maxLength: 100 }) }, { additionalProperties: false }),
      response: { 201: Type.Object({ url: Type.String(), expiresAt: Type.String() }), default: ProblemSchema },
    },
  }, async (request, reply) => {
    const plan = billingPlanByKey(request.body.planKey)
    if (!plan) {
      throw new ApiError(400, 'invalid_plan', 'Plano inexistente ou indisponivel para contratacao.')
    }
    if (!billingPortal?.createCheckout) {
      throw new ApiError(503, 'billing_not_configured', 'Checkout indisponivel enquanto o gateway e os gates comercial e juridico nao estiverem ativos.')
    }
    const checkout = await billingPortal.createCheckout(
      actorFrom(request), plan.planKey, String(request.headers['idempotency-key']),
    )
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
