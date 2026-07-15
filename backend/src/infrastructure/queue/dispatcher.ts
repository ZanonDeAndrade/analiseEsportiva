import type { InternalJobStore } from '../../application/ports/jobs.js'
import type { BullMqQueues } from './bullmq.js'
import type { SafeJobLogger } from './logging.js'

export class OutboxDispatcher {
  private timer?: NodeJS.Timeout
  private polling = false

  constructor(
    private readonly store: InternalJobStore,
    private readonly queues: BullMqQueues,
    private readonly logger: SafeJobLogger,
    private readonly intervalMs: number,
  ) {}

  async pollOnce(limit = 50) {
    if (this.polling) return 0
    this.polling = true
    try {
      const pending = await this.store.pendingDispatch(limit)
      let dispatched = 0
      for (const job of pending) {
        try {
          await this.queues.publish(job)
          await this.store.markDispatched(job.id)
          dispatched += 1
          this.logger.info('job_dispatched', correlation(job))
        } catch (error) {
          await this.store.markDispatchFailure(job.id)
          this.logger.error('job_dispatch_failed', {
            ...correlation(job),
            errorCode: safeErrorCode(error),
          })
        }
      }
      return dispatched
    } finally {
      this.polling = false
    }
  }

  start() {
    if (this.timer) return
    void this.pollOnce()
    this.timer = setInterval(() => void this.pollOnce(), this.intervalMs)
    this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
}

function correlation(job: {
  id: string
  queue: string
  requestId?: string
  modelVersionId?: string
  datasetVersionId?: string
}) {
  return {
    jobId: job.id,
    queue: job.queue,
    requestId: job.requestId,
    modelVersion: job.modelVersionId,
    datasetVersion: job.datasetVersionId,
  }
}

function safeErrorCode(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) return String(error.code)
  return error instanceof Error ? error.name : 'unknown_error'
}
