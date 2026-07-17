import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { PrivacyCoordinator } from '../../../../application/privacyCoordinator.js'
import type { OperationsRepository } from '../../../../application/ports/operations.js'
import { ProblemSchema } from '../problem.js'
import { actorFrom } from './helpers.js'

const TicketSchema = Type.Object({}, { additionalProperties: true })

export const privacyRoutes: FastifyPluginAsyncTypebox<{
  privacy: PrivacyCoordinator
  operations: OperationsRepository
}> = async (app, { privacy, operations }) => {
  app.get('/privacy/export', {
    config: { permission: 'privacy.export' },
    schema: {
      tags: ['privacy'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({}, { additionalProperties: true }), default: ProblemSchema },
    },
  }, async (request, reply) => {
    const payload = await privacy.exportSubjectData(actorFrom(request))
    void reply.headers({
      'cache-control': 'private, no-store, max-age=0',
      pragma: 'no-cache',
      'content-disposition': `attachment; filename="betintel-dados-${payload.generatedAt.slice(0, 10)}.json"`,
      'x-content-type-options': 'nosniff',
    })
    return payload
  })

  app.post('/privacy/corrections', {
    config: { permission: 'support.create' },
    schema: {
      tags: ['privacy'], security: [{ bearerAuth: [] }],
      body: Type.Object({
        subject: Type.String({ minLength: 5, maxLength: 120 }),
        details: Type.String({ minLength: 10, maxLength: 4_000 }),
      }, { additionalProperties: false }),
      response: { 202: TicketSchema, default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(202).send(await operations.createSupportTicket(actorFrom(request), {
    category: 'privacy', severity: 'sev3', subject: request.body.subject, description: request.body.details,
  })))

  app.delete('/privacy/organization', {
    config: { permission: 'organization.delete' },
    schema: {
      tags: ['privacy'], security: [{ bearerAuth: [] }],
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await privacy.deleteOrganization(actorFrom(request))
    return reply.code(204).send(null)
  })
}
