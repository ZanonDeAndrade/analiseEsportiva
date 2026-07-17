import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  SystemJobTypes,
  type SystemJobType,
} from '../../../../application/ports/jobs.js'
import type { JobQueue } from '../../../../application/ports/jobs.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { IdParamSchema, IdempotencyHeadersSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'
import type { ModelRepository, SportsRepository } from '../../../../application/ports/persistence.js'
import type { OperationsRepository } from '../../../../application/ports/operations.js'
import { IdentityError } from '../../../../application/identityErrors.js'

const JobResponseSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
  status: Type.String(),
  createdAt: Type.String(),
  queue: Type.Optional(Type.String()),
  attempts: Type.Optional(Type.Integer()),
  maxAttempts: Type.Optional(Type.Integer()),
  failureCode: Type.Optional(Type.String()),
  datasetVersionId: Type.Optional(Type.String()),
  modelVersionId: Type.Optional(Type.String()),
})

const QueueSummarySchema = Type.Object({
  queue: Type.String(),
  queued: Type.Integer(),
  running: Type.Integer(),
  succeeded: Type.Integer(),
  failed: Type.Integer(),
  cancelled: Type.Integer(),
  deadLetters: Type.Integer(),
  oldestQueuedAt: Type.Optional(Type.String()),
})

export const adminRoutes: FastifyPluginAsyncTypebox<{
  jobs: JobQueue
  sports: SportsRepository
  models: ModelRepository
  operations: OperationsRepository
}> = async (app, { jobs, sports, models, operations }) => {
  app.addHook('preHandler', async (request) => {
    if (request.actor?.platformAdmin !== true) throw new IdentityError('forbidden', 'Acesso restrito ao control plane.', 403)
  })
  registerJob(app, '/admin/jobs/sports-sync', SystemJobTypes.SPORTS_SYNC, jobs)
  registerJob(app, '/admin/jobs/model-training', SystemJobTypes.MODEL_TRAINING, jobs)
  registerJob(app, '/admin/jobs/evaluation', SystemJobTypes.EVALUATION, jobs)
  registerJob(app, '/admin/jobs/backtest', SystemJobTypes.BACKTEST, jobs)

  app.get('/admin/jobs/:id', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      response: { 200: JobResponseSchema, default: ProblemSchema },
    },
  }, async (request) => {
    const job = await jobs.getSystemJob(actorFrom(request), request.params.id)
    if (!job) throw new ApiError(404, 'not_found', 'Job não encontrado.')
    return job
  })

  app.delete('/admin/jobs/:id', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      response: { 202: Type.Object({ accepted: Type.Literal(true) }), default: ProblemSchema },
    },
  }, async (request, reply) => {
    const cancelled = await jobs.cancelSystemJob(actorFrom(request), request.params.id)
    if (!cancelled) throw new ApiError(404, 'not_found', 'Job não encontrado.')
    return reply.code(202).send({ accepted: true as const })
  })

  app.get('/admin/queues', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      response: {
        200: Type.Object({ queues: Type.Array(QueueSummarySchema) }),
        default: ProblemSchema,
      },
    },
  }, async (request) => ({ queues: await jobs.listQueueStatus(actorFrom(request)) }))

  app.get('/admin/data-quality', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      querystring: Type.Object({ status: Type.Optional(Type.Union([
        Type.Literal('open'), Type.Literal('resolved'), Type.Literal('rejected'),
      ])) }),
      response: { 200: Type.Object({ issues: Type.Array(Type.Object({}, { additionalProperties: true })) }), default: ProblemSchema },
    },
  }, async (request) => ({ issues: await sports.listDataQualityIssues(request.query.status) }))

  app.patch('/admin/data-quality/:id', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      body: Type.Object({ resolution: Type.Record(Type.String(), Type.Unknown()) }),
      response: { 200: Type.Object({ resolved: Type.Literal(true) }), default: ProblemSchema },
    },
  }, async (request) => {
    const actor = actorFrom(request)
    const resolved = await sports.resolveDataQualityIssue(request.params.id, {
      ...request.body.resolution,
      resolvedByUserId: actor.userId,
    })
    if (!resolved) throw new ApiError(404, 'not_found', 'Registro rejeitado ou ambiguidade não encontrado.')
    return { resolved: true as const }
  })

  app.get('/admin/team-aliases', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      querystring: Type.Object({ status: Type.Optional(Type.Union([
        Type.Literal('auto_accepted'), Type.Literal('pending'), Type.Literal('approved'), Type.Literal('rejected'),
      ])) }),
      response: { 200: Type.Object({ aliases: Type.Array(Type.Object({}, { additionalProperties: true })) }), default: ProblemSchema },
    },
  }, async (request) => ({ aliases: await sports.listAliasReviews(request.query.status) }))

  app.patch('/admin/team-aliases/:id', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      body: Type.Object({ status: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]) }),
      response: { 200: Type.Object({ reviewed: Type.Literal(true) }), default: ProblemSchema },
    },
  }, async (request) => {
    const reviewed = await sports.reviewAlias(request.params.id, request.body.status)
    if (!reviewed) throw new ApiError(404, 'not_found', 'Alias não encontrado.')
    return { reviewed: true as const }
  })

  app.get('/admin/data-freshness', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({}, { additionalProperties: true }), default: ProblemSchema },
    },
  }, async () => sports.dataFreshnessSummary())

  app.get('/admin/models', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ models: Type.Array(Type.Object({}, { additionalProperties: true })) }), default: ProblemSchema },
    },
  }, async () => ({ models: await models.listModelVersions() }))

  app.post('/admin/models/:id/rollback', {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      body: Type.Object({ reason: Type.String({ minLength: 10, maxLength: 500 }) }),
      response: { 200: Type.Object({ rolledBack: Type.Literal(true) }), default: ProblemSchema },
    },
  }, async (request) => {
    const actor = actorFrom(request)
    const rolledBack = await models.rollbackModel(
      request.params.id,
      `${request.body.reason} (actor=${actor.userId})`,
    )
    if (!rolledBack) throw new ApiError(409, 'rollback_not_allowed', 'Somente uma versão aposentada pode ser restaurada.')
    return { rolledBack: true as const }
  })

  app.get('/admin/support/tickets', {
    config: { permission: 'support.manage', platformAdmin: true },
    schema: { tags: ['admin'], security: [{ bearerAuth: [] }], response: { 200: Type.Object({ tickets: Type.Array(Type.Object({}, { additionalProperties: true })) }), default: ProblemSchema } },
  }, async (request) => ({ tickets: await operations.listSupportTickets(actorFrom(request)) }))

  app.patch('/admin/support/tickets/:id', {
    config: { permission: 'support.manage', platformAdmin: true },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      body: Type.Object({
        status: Type.Union(['open','in_progress','waiting_customer','resolved'].map((value) => Type.Literal(value))),
        ownerTeam: Type.Union(['support','engineering','security','billing','privacy'].map((value) => Type.Literal(value))),
      }, { additionalProperties: false }),
      response: { 200: Type.Object({}, { additionalProperties: true }), default: ProblemSchema },
    },
  }, async (request) => {
    const ticket = await operations.updateSupportTicket(actorFrom(request), request.params.id, request.body)
    if (!ticket) throw new ApiError(404, 'not_found', 'Chamado nao encontrado.')
    return ticket
  })

  app.get('/admin/audit', {
    config: { permission: 'audit.read', platformAdmin: true },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      querystring: Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) }),
      response: { 200: Type.Object({ entries: Type.Array(Type.Object({}, { additionalProperties: true })) }), default: ProblemSchema },
    },
  }, async (request) => ({ entries: await operations.listAudit(actorFrom(request), request.query.limit ?? 50) }))

  app.get('/admin/incidents', {
    config: { permission: 'incidents.manage', platformAdmin: true },
    schema: { tags: ['admin'], security: [{ bearerAuth: [] }], response: { 200: Type.Object({ incidents: Type.Array(Type.Object({}, { additionalProperties: true })) }), default: ProblemSchema } },
  }, async (request) => ({ incidents: await operations.listIncidents(actorFrom(request)) }))

  app.post('/admin/incidents', {
    config: { permission: 'incidents.manage', platformAdmin: true },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }],
      body: Type.Object({
        severity: Type.Union(['sev1','sev2','sev3','sev4'].map((value) => Type.Literal(value))),
        title: Type.String({ minLength: 5, maxLength: 120 }),
        summary: Type.String({ minLength: 10, maxLength: 4_000 }),
        ownerTeam: Type.Union(['support','engineering','security','billing','privacy'].map((value) => Type.Literal(value))),
        publicReference: Type.Optional(Type.String({ maxLength: 200 })),
      }, { additionalProperties: false }),
      response: { 201: Type.Object({}, { additionalProperties: true }), default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(201).send(await operations.createIncident(actorFrom(request), request.body)))

  app.patch('/admin/incidents/:id', {
    config: { permission: 'incidents.manage', platformAdmin: true },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      body: Type.Object({
        status: Type.Union(['investigating','identified','monitoring','resolved'].map((value) => Type.Literal(value))),
        summary: Type.String({ minLength: 10, maxLength: 4_000 }),
        ownerTeam: Type.Union(['support','engineering','security','billing','privacy'].map((value) => Type.Literal(value))),
        publicReference: Type.Optional(Type.String({ maxLength: 200 })),
      }, { additionalProperties: false }),
      response: { 200: Type.Object({}, { additionalProperties: true }), default: ProblemSchema },
    },
  }, async (request) => {
    const incident = await operations.updateIncident(actorFrom(request), request.params.id, request.body)
    if (!incident) throw new ApiError(404, 'not_found', 'Incidente nao encontrado.')
    return incident
  })
}

function registerJob(
  app: Parameters<FastifyPluginAsyncTypebox>[0],
  path: string,
  type: SystemJobType,
  jobs: JobQueue,
) {
  app.post(path, {
    config: { permission: 'system.manage' },
    schema: {
      tags: ['admin'], security: [{ bearerAuth: [] }], headers: IdempotencyHeadersSchema,
      response: { 202: JobResponseSchema, default: ProblemSchema },
    },
  }, async (request, reply) => {
    const key = request.headers['idempotency-key']
    const job = await jobs.enqueueSystemJob(actorFrom(request), type, String(key))
    return reply.code(202).send(job)
  })
}
