import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import Stripe from 'stripe'
import { ApiError, ProblemSchema } from '../problem.js'

export interface StripeWebhookGateway {
  processWebhook(rawBody: Buffer, signature: string): Promise<{ duplicate: boolean }>
}

export const stripeWebhookRoutes: FastifyPluginAsyncTypebox<{
  gateway: StripeWebhookGateway
}> = async (app, { gateway }) => {
  // Stripe signatures cover the exact bytes received. This parser is scoped
  // only to /webhooks so regular JSON API routes still receive decoded bodies.
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  app.post('/stripe', {
    config: { public: true },
    schema: {
      tags: ['billing'],
      headers: Type.Object({
        'stripe-signature': Type.String({ minLength: 1, maxLength: 2048 }),
      }, { additionalProperties: true }),
      response: {
        200: Type.Object({ received: Type.Literal(true), duplicate: Type.Boolean() }),
        default: ProblemSchema,
      },
    },
  }, async (request) => {
    if (!Buffer.isBuffer(request.body)) {
      throw new ApiError(400, 'invalid_webhook_body', 'O webhook exige corpo JSON bruto.')
    }
    try {
      const result = await gateway.processWebhook(
        request.body,
        String(request.headers['stripe-signature']),
      )
      return { received: true as const, duplicate: result.duplicate }
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new ApiError(400, 'invalid_webhook_signature', 'Assinatura do webhook Stripe inválida.')
      }
      throw error
    }
  })
}
