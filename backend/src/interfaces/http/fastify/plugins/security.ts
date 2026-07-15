import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import fp from 'fastify-plugin'
import { ApiError } from '../problem.js'

export const securityPlugin = fp<{
  allowedOrigins: string[]
}>(async (app, options) => {
  const origins = new Set(options.allowedOrigins.map((origin) => origin.replace(/\/$/, '')))
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || origins.has(origin.replace(/\/$/, ''))) callback(null, true)
      else callback(new ApiError(403, 'origin_not_allowed', 'Origem não permitida.'), false)
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
    maxAge: 600,
  })
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
  })
  app.addHook('onRequest', async (request) => {
    const contentLength = Number(request.headers['content-length'] ?? 0)
    const carriesBody =
      (Number.isFinite(contentLength) && contentLength > 0) ||
      request.headers['transfer-encoding'] !== undefined
    if (!carriesBody) return
    const mediaType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      throw new ApiError(
        415,
        'unsupported_media_type',
        'Use Content-Type application/json para este recurso.',
      )
    }
  })
}, { name: 'security' })
