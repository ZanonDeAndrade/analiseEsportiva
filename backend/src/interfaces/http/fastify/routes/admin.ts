import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  SystemJobTypes,
  type SystemJobType,
} from '../../../../application/ports/jobs.js'
import type { JobQueue } from '../../../../application/ports/jobs.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { IdParamSchema, IdempotencyHeadersSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'

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

export const adminRoutes: FastifyPluginAsyncTypebox<{ jobs: JobQueue }> = async (app, { jobs }) => {
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
