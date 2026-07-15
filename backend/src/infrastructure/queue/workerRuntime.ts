import { Job, UnrecoverableError, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import {
  JobCancelledError,
  JobTimeoutError,
  ProcessorUnavailableError,
} from '../../application/jobs/errors.js'
import { allQueuePolicies } from '../../application/jobs/policies.js'
import type {
  InternalJobStore,
  QueueName,
  SystemJobType,
} from '../../application/ports/jobs.js'
import type { SafeJobLogger } from './logging.js'
import { SpanKind } from '@opentelemetry/api'
import { captureOperationalError } from '../../telemetry/errors.js'
import { telemetryMetrics } from '../../telemetry/metrics.js'
import { extractTraceContext, withSpan } from '../../telemetry/tracing.js'

export interface WorkerJobData {
  jobId: string
  scope: 'system' | 'organization'
  organizationId?: string
  requestedByUserId?: string
  requestId?: string
  traceContext?: Record<string, string>
  datasetVersionId?: string
  modelVersionId?: string
  payload: Record<string, unknown>
}

export interface JobExecutionContext extends WorkerJobData {
  type: SystemJobType
  queue: QueueName
  signal: AbortSignal
  throwIfCancelled(): Promise<void>
}

export interface JobExecutionResult {
  datasetVersionId?: string
  modelVersionId?: string
  metadata?: Record<string, unknown>
}

export type JobProcessor = (context: JobExecutionContext) => Promise<JobExecutionResult | void>

export class BullMqWorkers {
  private readonly workers: Worker[] = []
  private readonly connections: Redis[] = []

  constructor(
    redisUrl: string,
    prefix: string,
    selectedQueues: QueueName[],
    processors: ReadonlyMap<SystemJobType, JobProcessor>,
    store: InternalJobStore,
    logger: SafeJobLogger,
  ) {
    const selected = new Set(selectedQueues)
    for (const policy of allQueuePolicies) {
      if (!selected.has(policy.queue)) continue
      const connection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        connectionName: `${prefix}:worker:${policy.queue}`,
      })
      connection.on('error', (error) => {
        logger.error('redis_connection_error', {
          queue: policy.queue,
          errorCode: (error as NodeJS.ErrnoException).code ?? 'redis_error',
        })
      })
      const worker = new Worker(
        policy.queue,
        (job) => executeJob(job, policy.queue, processors, store, logger),
        {
          connection,
          prefix,
          concurrency: policy.concurrency,
          lockDuration: Math.max(30_000, Math.min(policy.timeoutMs, 5 * 60_000)),
          maxStalledCount: 2,
        },
      )
      worker.on('error', (error) => {
        logger.error('worker_error', { queue: policy.queue, errorCode: safeFailureCode(error) })
      })
      this.connections.push(connection)
      this.workers.push(worker)
    }
  }

  async close() {
    await Promise.all(this.workers.map((worker) => worker.close()))
    await Promise.all(this.connections.map((connection) =>
      connection.quit().catch(() => connection.disconnect()),
    ))
  }
}

async function executeJob(
  job: Job<WorkerJobData>,
  queue: QueueName,
  processors: ReadonlyMap<SystemJobType, JobProcessor>,
  store: InternalJobStore,
  logger: SafeJobLogger,
) {
  const data = validateData(job.data)
  const type = job.name as SystemJobType
  return withSpan(
    `job ${type}`,
    {
      'messaging.system': 'bullmq',
      'messaging.destination.name': queue,
      'messaging.operation.name': 'process',
      'betintel.job.type': type,
      'betintel.job.id': data.jobId,
    },
    () => executeValidatedJob(job, queue, processors, store, logger, data, type),
    { kind: SpanKind.CONSUMER, parent: extractTraceContext(data.traceContext) },
  )
}

async function executeValidatedJob(
  job: Job<WorkerJobData>,
  queue: QueueName,
  processors: ReadonlyMap<SystemJobType, JobProcessor>,
  store: InternalJobStore,
  logger: SafeJobLogger,
  data: WorkerJobData,
  type: SystemJobType,
) {
  const startedAt = performance.now()
  const attempt = job.attemptsMade + 1
  const durable = await store.markRunning(data.jobId, attempt)
  if (!durable) {
    await store.markCancelled(data.jobId)
    throw new UnrecoverableError('job_cancelled')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new JobTimeoutError()), durable.timeoutMs)
  timeout.unref()
  let checkingCancellation = false
  const cancellationPoll = setInterval(() => {
    if (checkingCancellation || controller.signal.aborted) return
    checkingCancellation = true
    void store.isCancellationRequested(data.jobId)
      .then((cancelled) => {
        if (cancelled && !controller.signal.aborted) controller.abort(new JobCancelledError())
      })
      .finally(() => { checkingCancellation = false })
  }, 1_000)
  cancellationPoll.unref()
  const correlation = {
    jobId: data.jobId,
    requestId: data.requestId,
    modelVersion: data.modelVersionId,
    datasetVersion: data.datasetVersionId,
    queue,
    attempt,
    userId: data.requestedByUserId,
    organizationId: data.organizationId,
  }
  const context: JobExecutionContext = {
    ...data,
    type,
    queue,
    signal: controller.signal,
    async throwIfCancelled() {
      if (controller.signal.aborted || await store.isCancellationRequested(data.jobId)) {
        throw controller.signal.reason instanceof JobTimeoutError
          ? controller.signal.reason
          : new JobCancelledError()
      }
    },
  }

  logger.info('job_started', correlation)
  try {
    await context.throwIfCancelled()
    const processor = processors.get(type)
    if (!processor) throw new ProcessorUnavailableError()
    const result = await Promise.race([
      processor(context),
      abortPromise(controller.signal),
    ])
    await context.throwIfCancelled()
    await store.markSucceeded(data.jobId, result ?? {})
    logger.info('job_succeeded', {
      ...correlation,
      modelVersion: result?.modelVersionId ?? correlation.modelVersion,
      datasetVersion: result?.datasetVersionId ?? correlation.datasetVersion,
    })
    telemetryMetrics.recordJob({
      queue,
      type,
      outcome: 'succeeded',
      durationMs: performance.now() - startedAt,
    })
    return result ?? {}
  } catch (error) {
    const effectiveError = controller.signal.aborted && controller.signal.reason instanceof Error
      ? controller.signal.reason
      : error
    if (effectiveError instanceof JobCancelledError) {
      await store.markCancelled(data.jobId)
      logger.info('job_cancelled', correlation)
      telemetryMetrics.recordJob({
        queue, type, outcome: 'cancelled', durationMs: performance.now() - startedAt,
      })
      throw new UnrecoverableError('job_cancelled')
    }
    const failureCode = safeFailureCode(effectiveError)
    const unrecoverable = isUnrecoverable(effectiveError)
    const maxAttempts = Number(job.opts.attempts ?? durable.maxAttempts)
    if (unrecoverable || attempt >= maxAttempts) {
      await store.markDeadLetter(data.jobId, failureCode, attempt)
    } else {
      await store.markRetrying(data.jobId, failureCode)
    }
    const final = unrecoverable || attempt >= maxAttempts
    logger.error('job_failed', { ...correlation, failureCode, final })
    telemetryMetrics.recordJob({
      queue, type, outcome: final ? 'failed' : 'retrying', durationMs: performance.now() - startedAt,
    })
    if (final) {
      captureOperationalError(effectiveError, {
        component: 'worker',
        jobId: data.jobId,
        requestId: data.requestId,
        userId: data.requestedByUserId,
        organizationId: data.organizationId,
        queue,
        modelVersion: data.modelVersionId,
        datasetVersion: data.datasetVersionId,
      })
    }
    if (unrecoverable) throw new UnrecoverableError(failureCode)
    throw effectiveError instanceof Error ? effectiveError : new Error(failureCode)
  } finally {
    clearTimeout(timeout)
    clearInterval(cancellationPoll)
  }
}

function validateData(data: WorkerJobData): WorkerJobData {
  if (!data || typeof data !== 'object' || typeof data.jobId !== 'string') {
    throw new UnrecoverableError('invalid_job_payload')
  }
  if (data.scope === 'system' && data.organizationId) {
    throw new UnrecoverableError('system_job_has_organization')
  }
  if (data.scope === 'organization' && !data.organizationId) {
    throw new UnrecoverableError('private_job_missing_organization')
  }
  return data
}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new JobTimeoutError())
    signal.addEventListener('abort', () => reject(signal.reason ?? new JobTimeoutError()), { once: true })
  })
}

function isUnrecoverable(error: unknown) {
  return Boolean(
    error instanceof UnrecoverableError
    || (typeof error === 'object' && error && 'unrecoverable' in error && error.unrecoverable === true),
  )
}

function safeFailureCode(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    return sanitizeCode(String(error.code))
  }
  if (error instanceof JobTimeoutError) return error.code
  return error instanceof Error ? sanitizeCode(error.name) : 'unknown_error'
}

function sanitizeCode(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 80)
  return normalized || 'unknown_error'
}
