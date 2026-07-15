import { createHmac } from 'node:crypto'
import fp from 'fastify-plugin'
import type { IdentityService } from '../../../../application/identityService.js'
import '../../fastify/types.js'

export const authenticationPlugin = fp<{
  identityService: IdentityService
  requestIpHashKey: string
}>(async (app, options) => {
  app.decorateRequest('actor', null)
  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.config.public === true) return
    request.actor = await options.identityService.authenticate(request.headers.authorization, {
      requestId: request.id,
      userAgent: headerValue(request.headers['user-agent']),
      ipHash: hashRemoteAddress(request.ip, options.requestIpHashKey),
    })
  })
}, { name: 'authentication' })

function hashRemoteAddress(value: string | undefined, key: string) {
  if (!value) return undefined
  return createHmac('sha256', key).update(value).digest('hex')
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
