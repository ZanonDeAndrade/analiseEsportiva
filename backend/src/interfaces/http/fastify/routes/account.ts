import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { IdentityService } from '../../../../application/identityService.js'
import { ProblemSchema } from '../problem.js'
import {
  EmailBodySchema,
  ReplacementOwnerBodySchema,
  SessionIdParamSchema,
} from '../schemas.js'
import { actorFrom } from './helpers.js'

const LooseResponse = Type.Object({}, { additionalProperties: true })

export const accountRoutes: FastifyPluginAsyncTypebox<{
  identityService: IdentityService
}> = async (app, { identityService }) => {
  app.get('/me', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }],
      response: {
        200: Type.Object({
          userId: Type.String(), organizationId: Type.String(), role: Type.String(), sessionId: Type.String(),
        }),
        default: ProblemSchema,
      },
    },
  }, async (request) => {
    const actor = actorFrom(request)
    return {
      userId: actor.userId,
      organizationId: actor.organizationId,
      role: actor.role,
      sessionId: actor.sessionId,
    }
  })

  app.get('/account/sessions', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ sessions: Type.Array(LooseResponse) }), default: ProblemSchema },
    },
  }, async (request) => ({ sessions: await identityService.listSessions(actorFrom(request)) }))

  app.delete('/account/sessions/:sessionId', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }], params: SessionIdParamSchema,
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await identityService.revokeSession(actorFrom(request), request.params.sessionId)
    return reply.code(204).send(null)
  })

  app.post('/account/email-change', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }], body: EmailBodySchema,
      response: { 202: LooseResponse, default: ProblemSchema },
    },
  }, async (request, reply) => {
    await identityService.requestEmailChange(actorFrom(request), request.body.email)
    return reply.code(202).send({
      status: 'verification_required',
      message: 'Confirme o novo e-mail enviado pelo Auth0. Todas as sessões foram revogadas.',
    })
  })

  app.post('/account/profile-sync', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }],
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await identityService.syncProfile(actorFrom(request))
    return reply.code(204).send(null)
  })

  app.post('/account/deactivate', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }], body: ReplacementOwnerBodySchema,
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await identityService.deactivateAccount(actorFrom(request), request.body.replacementOwnerUserId)
    return reply.code(204).send(null)
  })

  app.delete('/account', {
    schema: {
      tags: ['account'], security: [{ bearerAuth: [] }], body: ReplacementOwnerBodySchema,
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await identityService.deleteAccount(actorFrom(request), request.body.replacementOwnerUserId)
    return reply.code(204).send(null)
  })
}
