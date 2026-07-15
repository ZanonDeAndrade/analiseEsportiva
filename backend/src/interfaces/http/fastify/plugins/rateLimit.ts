import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import type { Redis } from 'ioredis'
import { problem } from '../problem.js'

export const rateLimitPlugin = fp<{
  max: number
  timeWindow: string
  redis?: Redis
  namespace?: string
}>(async (app, options) => {
  await app.register(rateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.timeWindow,
    redis: options.redis,
    nameSpace: options.namespace,
    skipOnError: false,
    // Executa antes da autenticacao para tambem limitar tokens invalidos.
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (request) =>
      problem(request.id, 429, 'rate_limit_exceeded', 'Muitas requisições. Tente novamente mais tarde.'),
  })
}, { name: 'rate-limit' })
