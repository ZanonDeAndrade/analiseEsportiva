import type { ActorContext } from '../../../application/ports/identity.js'
import type { Permission } from '../../../application/authorization.js'

export interface ObservabilitySnapshot {
  requests: number
  errors: number
  timeouts: number
  rateLimited: number
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: ActorContext | null
  }

  interface FastifyContextConfig {
    public?: boolean
    permission?: Permission
    requestTimeoutMs?: number
  }

  interface FastifyInstance {
    observability: ObservabilitySnapshot
  }
}
