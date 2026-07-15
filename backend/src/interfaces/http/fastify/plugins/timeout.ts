import fp from 'fastify-plugin'
import { problem } from '../problem.js'

export const responseTimeoutPlugin = fp<{ defaultTimeoutMs: number }>(async (app, options) => {
  app.addHook('onRequest', (request, reply, done) => {
    const timeoutMs = request.routeOptions.config.requestTimeoutMs ?? options.defaultTimeoutMs
    const timer = setTimeout(() => {
      if (reply.sent) return
      void reply
        .code(504)
        .type('application/problem+json')
        .send(problem(request.id, 504, 'request_timeout', 'A operação excedeu o tempo permitido.'))
    }, timeoutMs)
    timer.unref()
    reply.raw.once('finish', () => clearTimeout(timer))
    reply.raw.once('close', () => clearTimeout(timer))
    done()
  })
}, { name: 'response-timeout' })
