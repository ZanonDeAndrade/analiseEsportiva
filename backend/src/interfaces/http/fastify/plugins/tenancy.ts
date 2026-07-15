import fp from 'fastify-plugin'
import { IdentityError } from '../../../../application/identityErrors.js'
import '../../fastify/types.js'

export const tenancyPlugin = fp(async (app) => {
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.config.public === true) return
    if (!request.actor?.organizationId) {
      throw new IdentityError(
        'membership_required',
        'Associação organizacional ativa necessária.',
        403,
      )
    }
  })
}, { name: 'tenancy', dependencies: ['authentication'] })
