import fp from 'fastify-plugin'
import { requirePermission } from '../../../../application/authorization.js'
import { IdentityError } from '../../../../application/identityErrors.js'
import '../../fastify/types.js'

export const authorizationPlugin = fp(async (app) => {
  app.addHook('preHandler', async (request) => {
    const permission = request.routeOptions.config.permission
    if (!permission) return
    if (!request.actor) throw new Error('ActorContext ausente após autenticação.')
    requirePermission(request.actor.role, permission)
    if (request.routeOptions.config.platformAdmin === true && request.actor.platformAdmin !== true) {
      throw new IdentityError('forbidden', 'Acesso restrito ao control plane.', 403)
    }
  })
}, { name: 'authorization', dependencies: ['authentication', 'tenancy'] })
