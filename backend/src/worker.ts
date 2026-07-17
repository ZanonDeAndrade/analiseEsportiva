import { Redis } from 'ioredis'
import {
  bullmqRedisUrl,
  providerQuotaConfig,
  redisKeyPrefix,
  shutdownGracePeriodMs,
  validateRuntimeConfiguration,
  workerDatabaseUrl,
  workerPollIntervalMs,
  workerQueues as configuredWorkerQueues,
} from './config.js'
import { createJobProcessors } from './application/jobs/processors.js'
import { executableJobTypes } from './application/jobs/policies.js'
import { queueForJobType, type QueueName } from './application/ports/jobs.js'
import {
  assertSafeRuntimeDatabaseRole,
  createDatabaseConnection,
} from './infrastructure/database/client.js'
import { PostgresProviderQuota } from './infrastructure/database/providerQuota.js'
import { createPostgresRepositories } from './infrastructure/database/repositories.js'
import { PostgresTrainingLock } from './infrastructure/database/trainingLock.js'
import { BullMqQueues } from './infrastructure/queue/bullmq.js'
import { OutboxDispatcher } from './infrastructure/queue/dispatcher.js'
import {
  ExternalRequestGuard,
  RedisCircuitBreaker,
} from './infrastructure/queue/externalRequests.js'
import { consoleJobLogger } from './infrastructure/queue/logging.js'
import { BullMqWorkers } from './infrastructure/queue/workerRuntime.js'
import { installGracefulShutdown } from './runtime/gracefulShutdown.js'
import { shutdownTelemetry } from './telemetry/instrumentation.js'
import { captureOperationalError } from './telemetry/errors.js'
import { telemetryMetrics } from './telemetry/metrics.js'

validateRuntimeConfiguration('worker')
const connection = createDatabaseConnection(workerDatabaseUrl())
await assertSafeRuntimeDatabaseRole(connection)
const repositories = createPostgresRepositories(connection)
const redisUrl = bullmqRedisUrl()
const prefix = redisKeyPrefix()
const breakerConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectionName: `${prefix}:circuit-breaker`,
})
breakerConnection.on('error', (error) => {
  consoleJobLogger.error('redis_connection_error', {
    errorCode: (error as NodeJS.ErrnoException).code ?? 'redis_error',
  })
  telemetryMetrics.recordDependency('redis', false)
  captureOperationalError(error, { component: 'redis' })
})
await assertNoEviction(breakerConnection)

const queues = new BullMqQueues(redisUrl, prefix)
const dispatcher = new OutboxDispatcher(
  repositories.jobs,
  queues,
  consoleJobLogger,
  workerPollIntervalMs(),
)
const externalRequests = new ExternalRequestGuard(
  new PostgresProviderQuota(connection.db),
  new RedisCircuitBreaker(breakerConnection, prefix),
  consoleJobLogger,
)
const processors = createJobProcessors({
  repositories,
  jobs: repositories.jobs,
  trainingLock: new PostgresTrainingLock(connection.pool),
  externalRequests,
  logger: consoleJobLogger,
  quotas: {
    apiFootball: providerQuotaConfig('api-football'),
    footballData: providerQuotaConfig('football-data'),
    footballDataOrg: providerQuotaConfig('football-data-org'),
  },
  apiFootballMinimumGapMs: Number(process.env.BETINTEL_API_MIN_GAP_MS ?? 6_500),
})
const workers = new BullMqWorkers(
  redisUrl,
  prefix,
  selectedQueues(),
  processors,
  repositories.jobs,
  consoleJobLogger,
)

dispatcher.start()
consoleJobLogger.info('worker_started', { queues: selectedQueues().join(',') })

installGracefulShutdown({
  processName: 'worker',
  timeoutMs: shutdownGracePeriodMs(),
  close: async () => {
    dispatcher.stop()
    await workers.close()
    await queues.close()
    await breakerConnection.quit().catch(() => breakerConnection.disconnect())
    await connection.close()
    await shutdownTelemetry()
  },
})

function selectedQueues(): QueueName[] {
  const configured = configuredWorkerQueues()
  const defaults = [...new Set([...executableJobTypes].map(queueForJobType))]
  const values = configured?.length ? configured : defaults
  const allowed = new Set(defaults.concat([
    'export',
    'notification',
    'billing-reconciliation',
    'maintenance',
  ] as QueueName[]))
  for (const queue of values) {
    if (!allowed.has(queue as QueueName)) throw new Error(`WORKER_QUEUES contem fila invalida: ${queue}`)
  }
  return values as QueueName[]
}

async function assertNoEviction(redis: Redis) {
  if (process.env.NODE_ENV !== 'production') return
  const result = await redis.config('GET', 'maxmemory-policy')
  const policy = Array.isArray(result) ? result[1] : undefined
  if (policy !== 'noeviction') {
    throw new Error('Redis do BullMQ deve usar maxmemory-policy=noeviction em producao.')
  }
}
