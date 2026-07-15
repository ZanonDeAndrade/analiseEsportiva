import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { ActorContext } from '../../../../application/ports/identity.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { IdempotencyHeadersSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'

export interface BillingPortalGateway {
  createPortal(actor: ActorContext, idempotencyKey: string): Promise<{ url: string; expiresAt: string }>
}

export const billingRoutes: FastifyPluginAsyncTypebox<{
  billingPortal?: BillingPortalGateway
}> = async (app, { billingPortal }) => {
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
}
