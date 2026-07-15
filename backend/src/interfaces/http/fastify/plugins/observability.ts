import fp from 'fastify-plugin'
import { telemetryMetrics } from '../../../../telemetry/metrics.js'
import '../../fastify/types.js'

export const observabilityPlugin = fp(async (app) => {
  app.decorate('observability', {
    requests: 0,
    errors: 0,
    timeouts: 0,
    rateLimited: 0,
  })
  app.addHook('onRequest', async () => {
    app.observability.requests += 1
  })
  app.addHook('onResponse', async (_request, reply) => {
    if (reply.statusCode >= 500) app.observability.errors += 1
    if (reply.statusCode === 504) app.observability.timeouts += 1
    if (reply.statusCode === 429) app.observability.rateLimited += 1
    telemetryMetrics.recordHttp({
      route: _request.routeOptions.url ?? 'unmatched',
      method: _request.method,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    })
  })
}, { name: 'observability' })
