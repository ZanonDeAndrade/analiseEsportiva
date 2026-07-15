import fp from 'fastify-plugin'
import { requirePermission } from '../../../../application/authorization.js'
import '../../fastify/types.js'

export const authorizationPlugin = fp(async (app) => {
  app.addHook('preHandler', async (request) => {
    const permission = request.routeOptions.config.permission
    if (!permission) return
    if (!request.actor) throw new Error('ActorContext ausente após autenticação.')
    requirePermission(request.actor.role, permission)
  })
}, { name: 'authorization', dependencies: ['authentication', 'tenancy'] })
