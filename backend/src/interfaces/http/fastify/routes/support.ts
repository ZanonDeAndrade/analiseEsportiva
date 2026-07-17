import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { OperationsRepository } from '../../../../application/ports/operations.js'
import { ProblemSchema } from '../problem.js'
import { actorFrom } from './helpers.js'

const Category = Type.Union(['access','billing','data','privacy','security','technical','other'].map((value) => Type.Literal(value)))
const Severity = Type.Union(['sev1','sev2','sev3','sev4'].map((value) => Type.Literal(value)))
const Loose = Type.Object({}, { additionalProperties: true })

export const supportRoutes: FastifyPluginAsyncTypebox<{ operations: OperationsRepository }> = async (app, { operations }) => {
  app.get('/support/tickets', {
    config: { permission: 'support.create' },
    schema: { tags: ['support'], security: [{ bearerAuth: [] }], response: { 200: Type.Object({ tickets: Type.Array(Loose) }), default: ProblemSchema } },
  }, async (request) => ({ tickets: await operations.listOwnSupportTickets(actorFrom(request)) }))

  app.post('/support/tickets', {
    config: { permission: 'support.create' },
    schema: {
      tags: ['support'], security: [{ bearerAuth: [] }],
      body: Type.Object({
        category: Category, severity: Severity,
        subject: Type.String({ minLength: 5, maxLength: 120 }),
        description: Type.String({ minLength: 10, maxLength: 4_000 }),
      }, { additionalProperties: false }),
      response: { 201: Loose, default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(201).send(await operations.createSupportTicket(actorFrom(request), request.body)))
}
