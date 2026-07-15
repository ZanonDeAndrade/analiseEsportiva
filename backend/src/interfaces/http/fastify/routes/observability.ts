import { createHash, timingSafeEqual } from 'node:crypto'
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { DatabaseConnection } from '../../../../infrastructure/database/client.js'
import { telemetryMetrics } from '../../../../telemetry/metrics.js'
import { ProblemSchema } from '../problem.js'

export const observabilityRoutes: FastifyPluginAsyncTypebox<{
  connection: DatabaseConnection
  metricsBearerToken?: string
}> = async (app, options) => {
  app.get('/internal/observability', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['internal'], security: [{ bearerAuth: [] }],
      response: {
        200: Type.Object({
          requests: Type.Integer(), errors: Type.Integer(), timeouts: Type.Integer(), rateLimited: Type.Integer(),
        }),
        default: ProblemSchema,
      },
    },
  }, async () => ({ ...app.observability }))

  app.get('/internal/metrics', {
    config: { public: true, rateLimit: false },
    schema: {
      tags: ['internal'],
      hide: true,
      response: { 200: Type.String(), 401: ProblemSchema, default: ProblemSchema },
    },
    preHandler: async (request, reply) => {
      if (!options.metricsBearerToken || !validBearer(request.headers.authorization, options.metricsBearerToken)) {
        return reply.code(401).type('application/problem+json').send({
          type: 'https://betintel.ai/problems/authentication_required',
          title: 'Não autorizado',
          status: 401,
          code: 'authentication_required',
          detail: 'Autenticação necessária.',
          requestId: request.id,
        })
      }
    },
  }, async (_request, reply) => {
    await telemetryMetrics.collectOperational(options.connection)
    return reply.type(telemetryMetrics.contentType).send(await telemetryMetrics.exposition())
  })
}

function validBearer(header: string | undefined, expected: string) {
  if (!header?.startsWith('Bearer ')) return false
  const actualHash = createHash('sha256').update(header.slice(7)).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualHash, expectedHash)
}
