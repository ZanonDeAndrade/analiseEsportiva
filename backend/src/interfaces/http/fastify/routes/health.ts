import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { ModelRepository } from '../../../../application/ports/persistence.js'
import type { DatabaseConnection } from '../../../../infrastructure/database/client.js'
import { ProblemSchema } from '../problem.js'
import { telemetryMetrics } from '../../../../telemetry/metrics.js'

const DependencyStatusSchema = Type.Union([
  Type.Literal('up'),
  Type.Literal('down'),
  Type.Literal('not_configured'),
])

const ReadinessSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('not_ready')]),
  storage: Type.Literal('postgresql'),
  modelLoaded: Type.Boolean(),
  dependencies: Type.Object({
    postgresql: DependencyStatusSchema,
    redis: DependencyStatusSchema,
  }),
})

export const healthRoutes: FastifyPluginAsyncTypebox<{
  connection: DatabaseConnection
  models: ModelRepository
  redisCheck?: () => Promise<unknown>
  requireRedis: boolean
  dependencyTimeoutMs: number
}> = async (app, options) => {
  app.get('/health/live', {
    config: { public: true, rateLimit: false },
    schema: {
      tags: ['health'],
      response: { 200: Type.Object({ status: Type.Literal('ok') }), default: ProblemSchema },
    },
  }, async (_request, reply) => {
    void reply.header('cache-control', 'no-store')
    return { status: 'ok' as const }
  })

  app.get('/health/ready', {
    config: {
      public: true,
      rateLimit: false,
      requestTimeoutMs: options.dependencyTimeoutMs + 500,
    },
    schema: {
      tags: ['health'],
      response: { 200: ReadinessSchema, 503: ReadinessSchema, default: ProblemSchema },
    },
  }, async (_request, reply) => {
    let modelLoaded = false
    const databaseStartedAt = performance.now()
    const postgresql = await probe(async () => {
      await options.connection.pool.query('select 1')
      modelLoaded = Boolean(await options.models.getActiveModel())
    }, options.dependencyTimeoutMs)
    telemetryMetrics.recordDatabase(
      'readiness',
      performance.now() - databaseStartedAt,
      postgresql === 'up',
    )
    const redisStartedAt = performance.now()
    const redis = options.redisCheck
      ? await probe(options.redisCheck, options.dependencyTimeoutMs)
      : 'not_configured' as const
    if (redis !== 'not_configured') {
      telemetryMetrics.recordDependency('redis', redis === 'up')
      void redisStartedAt
    }
    const ready = postgresql === 'up' && (!options.requireRedis || redis === 'up')

    void reply.header('cache-control', 'no-store')
    if (!ready) void reply.code(503)
    return {
      status: ready ? 'ok' as const : 'not_ready' as const,
      storage: 'postgresql' as const,
      modelLoaded,
      dependencies: { postgresql, redis },
    }
  })
}

async function probe(
  check: () => Promise<unknown>,
  timeoutMs: number,
): Promise<'up' | 'down'> {
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      check(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('dependency_timeout')), timeoutMs)
      }),
    ])
    return 'up'
  } catch {
    return 'down'
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
