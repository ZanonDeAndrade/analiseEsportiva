import { Queue, type JobsOptions } from 'bullmq'
import { Redis } from 'ioredis'
import { allQueuePolicies, jobPolicy } from '../../application/jobs/policies.js'
import type { DurableJob, QueueName } from '../../application/ports/jobs.js'

export class BullMqQueues {
  private readonly connection: Redis
  private readonly queues = new Map<QueueName, Queue>()

  constructor(redisUrl: string, prefix: string) {
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectionName: `${prefix}:producer`,
    })
    this.connection.on('error', (error) => {
      console.error(JSON.stringify({
        level: 'error',
        event: 'bullmq_producer_connection_error',
        code: (error as NodeJS.ErrnoException).code ?? 'redis_error',
      }))
    })
    for (const policy of allQueuePolicies) {
      this.queues.set(policy.queue, new Queue(policy.queue, {
        connection: this.connection,
        prefix,
      }))
    }
  }

  async publish(job: DurableJob) {
    const queue = this.queues.get(job.queue)
    if (!queue) throw new Error(`Fila nao configurada: ${job.queue}`)
    const policy = jobPolicy(job.type)
    return queue.add(job.type, {
      jobId: job.id,
      scope: job.scope,
      organizationId: job.organizationId,
      requestedByUserId: job.requestedByUserId,
      requestId: job.requestId,
      traceContext: job.traceContext,
      datasetVersionId: job.datasetVersionId,
      modelVersionId: job.modelVersionId,
      payload: job.payload,
    }, jobOptions(job.id, policy))
  }

  get(queue: QueueName) {
    const value = this.queues.get(queue)
    if (!value) throw new Error(`Fila nao configurada: ${queue}`)
    return value
  }

  async close() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()))
    await this.connection.quit().catch(() => this.connection.disconnect())
  }
}

function jobOptions(
  jobId: string,
  policy: ReturnType<typeof jobPolicy>,
): JobsOptions {
  return {
    jobId,
    attempts: policy.attempts,
    backoff: {
      type: 'exponential',
      delay: policy.backoffDelayMs,
      jitter: policy.jitter,
    },
    removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
    removeOnFail: { age: 30 * 24 * 60 * 60, count: 5_000 },
  }
}
