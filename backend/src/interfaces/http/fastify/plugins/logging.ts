import fp from 'fastify-plugin'
import { activeTraceIds } from '../../../../telemetry/tracing.js'

export const safeLoggingPlugin = fp(async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  app.addHook('onResponse', async (request, reply) => {
    const actor = request.actor
    request.log.info({
      event: 'http_request_completed',
      requestId: request.id,
      userId: actor?.userId,
      organizationId: actor?.organizationId,
      method: request.method,
      route: request.routeOptions.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
      ...activeTraceIds(),
    })
  })
}, { name: 'safe-logging' })
