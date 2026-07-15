import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { jobPolicy } from '../../application/jobs/policies.js'
import type {
  DurableJob,
  InternalJobStore,
  JobQueue,
  JobReference,
  JobStatus,
  QueueName,
  QueueStatusSummary,
  SystemJobType,
} from '../../application/ports/jobs.js'
import { QueueNames, queueForJobType } from '../../application/ports/jobs.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type { BetIntelDatabase } from './client.js'
import {
  auditLog,
  backgroundJobs,
  datasetVersions,
  deadLetterJobs,
} from './schema.js'
import { applyActorContext } from './tenantContext.js'
import { injectTraceContext } from '../../telemetry/tracing.js'

export class PostgresJobQueue implements JobQueue, InternalJobStore {
  constructor(private readonly db: BetIntelDatabase) {}

  async enqueueSystemJob(
    actor: ActorContext,
    type: SystemJobType,
    idempotencyKey: string,
  ): Promise<JobReference> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      return this.insertJob(tx, {
        type,
        idempotencyKey,
        scope: 'system',
        requestedByUserId: actor.userId,
        requestId: actor.requestId,
        auditOrganizationId: actor.organizationId,
        idempotencyScope: `${actor.organizationId}:${actor.userId}`,
      })
    })
  }

  async enqueueScheduledSystemJob(
    type: SystemJobType,
    idempotencyKey: string,
    payload: Record<string, unknown> = {},
  ): Promise<JobReference> {
    return this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'scheduler')
      return this.insertJob(tx, {
        type,
        idempotencyKey,
        scope: 'system',
        payload,
      })
    })
  }

  async enqueueRelatedJob(input: {
    type: SystemJobType
    idempotencyKey: string
    payload?: Record<string, unknown>
    requestId?: string
    organizationId?: string
    requestedByUserId?: string
    datasetVersionId?: string
    modelVersionId?: string
    parentJobId?: string
  }): Promise<JobReference> {
    return this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      return this.insertJob(tx, {
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        scope: input.organizationId ? 'organization' : 'system',
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
        requestId: input.requestId,
        datasetVersionId: input.datasetVersionId,
        modelVersionId: input.modelVersionId,
        payload: {
          ...(input.payload ?? {}),
          ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}),
        },
      })
    })
  }

  async getSystemJob(actor: ActorContext, id: string): Promise<JobReference | null> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .select(jobSelection())
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.id, id),
            eq(backgroundJobs.scope, 'system'),
            eq(backgroundJobs.requestedByUserId, actor.userId),
          ),
        )
        .limit(1)
      return rows[0] ? toReference(rows[0]) : null
    })
  }

  async cancelSystemJob(actor: ActorContext, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .update(backgroundJobs)
        .set({
          cancelRequestedAt: new Date().toISOString(),
          status: sql`case when ${backgroundJobs.status} = 'queued' then 'cancelled'::ops.job_status else ${backgroundJobs.status} end`,
        })
        .where(
          and(
            eq(backgroundJobs.id, id),
            eq(backgroundJobs.scope, 'system'),
            eq(backgroundJobs.requestedByUserId, actor.userId),
            inArray(backgroundJobs.status, ['queued', 'running']),
          ),
        )
        .returning({ id: backgroundJobs.id })
      return rows.length === 1
    })
  }

  async listQueueStatus(actor: ActorContext): Promise<QueueStatusSummary[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const jobs = await tx
        .select({
          queue: backgroundJobs.queue,
          status: backgroundJobs.status,
          createdAt: backgroundJobs.createdAt,
        })
        .from(backgroundJobs)
      const deadLetters = await tx
        .select({ queue: deadLetterJobs.queue })
        .from(deadLetterJobs)
      return summarizeQueues(jobs, deadLetters)
    })
  }

  async pendingDispatch(limit: number): Promise<DurableJob[]> {
    return this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      const rows = await tx
        .select(durableSelection())
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.status, 'queued'),
            isNull(backgroundJobs.dispatchedAt),
            isNull(backgroundJobs.cancelRequestedAt),
            lte(backgroundJobs.scheduledAt, new Date().toISOString()),
          ),
        )
        .orderBy(asc(backgroundJobs.scheduledAt), asc(backgroundJobs.createdAt))
        .limit(Math.max(1, Math.min(limit, 100)))
      return rows.map(toDurableJob)
    })
  }

  async markDispatched(id: string): Promise<void> {
    await this.workerUpdate(id, {
      dispatchedAt: new Date().toISOString(),
      dispatchAttempts: sql`${backgroundJobs.dispatchAttempts} + 1`,
      failureCode: null,
    })
  }

  async markDispatchFailure(id: string): Promise<void> {
    await this.workerUpdate(id, {
      dispatchAttempts: sql`${backgroundJobs.dispatchAttempts} + 1`,
      failureCode: 'queue_unavailable',
      scheduledAt: sql`now() + make_interval(secs => least(60, power(2, least(${backgroundJobs.dispatchAttempts}, 6))) + random())`,
    })
  }

  async markRunning(id: string, attempt: number): Promise<DurableJob | null> {
    return this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      const rows = await tx
        .update(backgroundJobs)
        .set({
          status: 'running',
          attempts: attempt,
          startedAt: new Date().toISOString(),
          failureCode: null,
        })
        .where(and(eq(backgroundJobs.id, id), isNull(backgroundJobs.cancelRequestedAt)))
        .returning(durableSelection())
      return rows[0] ? toDurableJob(rows[0]) : null
    })
  }

  async markRetrying(id: string, failureCode: string): Promise<void> {
    await this.workerUpdate(id, { status: 'queued', failureCode })
  }

  async markCancelled(id: string): Promise<void> {
    await this.workerUpdate(id, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
      failureCode: 'cancelled',
    })
  }

  async markSucceeded(
    id: string,
    result: {
      datasetVersionId?: string
      modelVersionId?: string
      metadata?: Record<string, unknown>
    } = {},
  ): Promise<void> {
    await this.workerUpdate(id, {
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      failureCode: null,
      datasetVersionId: result.datasetVersionId,
      modelVersionId: result.modelVersionId,
      resultMetadata: result.metadata ?? {},
    })
  }

  async markDeadLetter(id: string, failureCode: string, attempts: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      const jobs = await tx
        .select(durableSelection())
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, id))
        .limit(1)
      const job = jobs[0]
      if (!job) return
      await tx
        .insert(deadLetterJobs)
        .values({
          backgroundJobId: job.id,
          scope: job.scope,
          organizationId: job.organizationId,
          requestedByUserId: job.requestedByUserId,
          queue: job.queue,
          jobType: job.type,
          attempts: Math.max(1, attempts),
          failureCode,
          requestId: job.requestId,
          datasetVersionId: job.datasetVersionId,
          modelVersionId: job.modelVersionId,
        })
        .onConflictDoNothing({ target: deadLetterJobs.backgroundJobId })
      await tx
        .update(backgroundJobs)
        .set({
          status: 'failed',
          completedAt: new Date().toISOString(),
          failureCode,
        })
        .where(eq(backgroundJobs.id, id))
    })
  }

  async isCancellationRequested(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      const rows = await tx
        .select({ value: backgroundJobs.cancelRequestedAt })
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, id))
        .limit(1)
      return Boolean(rows[0]?.value)
    })
  }

  async latestReadyDatasetVersionId(): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      const rows = await tx
        .select({ id: datasetVersions.id })
        .from(datasetVersions)
        .where(eq(datasetVersions.status, 'ready'))
        .orderBy(desc(datasetVersions.createdAt))
        .limit(1)
      return rows[0]?.id ?? null
    })
  }

  private async insertJob(
    tx: Parameters<Parameters<BetIntelDatabase['transaction']>[0]>[0],
    input: {
      type: SystemJobType
      idempotencyKey: string
      scope: 'system' | 'organization'
      organizationId?: string
      requestedByUserId?: string
      requestId?: string
      datasetVersionId?: string
      modelVersionId?: string
      payload?: Record<string, unknown>
      auditOrganizationId?: string
      idempotencyScope?: string
    },
  ): Promise<JobReference> {
    const queue = queueForJobType(input.type)
    const policy = jobPolicy(input.type)
    const scopedKey = createHash('sha256')
      .update(`${input.idempotencyScope ?? `${input.scope}:${input.organizationId ?? 'system'}`}:${input.type}:${input.idempotencyKey}`)
      .digest('hex')
    const inserted = await tx
      .insert(backgroundJobs)
      .values({
        scope: input.scope,
        organizationId: input.organizationId,
        queue,
        jobType: input.type,
        idempotencyKey: scopedKey,
        requestedByUserId: input.requestedByUserId,
        requestId: input.requestId,
        datasetVersionId: input.datasetVersionId,
        modelVersionId: input.modelVersionId,
        payload: input.payload ?? {},
        traceContext: injectTraceContext(),
        maxAttempts: policy.attempts,
        timeoutMs: policy.timeoutMs,
      })
      .onConflictDoNothing({
        target: [backgroundJobs.queue, backgroundJobs.idempotencyKey],
      })
      .returning(jobSelection())
    const row = inserted[0] ?? (
      await tx
        .select(jobSelection())
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.queue, queue),
            eq(backgroundJobs.idempotencyKey, scopedKey),
          ),
        )
        .limit(1)
    )[0]
    if (!row) throw new Error('Falha ao registrar job durável.')

    if (inserted[0]) {
      await tx.insert(auditLog).values({
        scope: input.auditOrganizationId ? 'organization' : input.scope,
        organizationId: input.auditOrganizationId ?? input.organizationId,
        actorUserId: input.requestedByUserId,
        action: 'admin.job_queued',
        targetType: 'background_job',
        targetId: row.id,
        requestId: input.requestId,
        metadata: { before: null, after: { type: input.type, queue, status: row.status } },
      })
    }
    return toReference(row)
  }

  private async workerUpdate(
    id: string,
    values: Parameters<ReturnType<BetIntelDatabase['update']>['set']>[0],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyServiceContext(tx, 'worker')
      await tx.update(backgroundJobs).set(values).where(eq(backgroundJobs.id, id))
    })
  }
}

async function applyServiceContext(
  tx: Parameters<Parameters<BetIntelDatabase['transaction']>[0]>[0],
  role: 'worker' | 'scheduler',
) {
  await tx.execute(sql`select set_config('app.service_role', ${role}, true)`)
}

function jobSelection() {
  return {
    id: backgroundJobs.id,
    type: backgroundJobs.jobType,
    queue: backgroundJobs.queue,
    status: backgroundJobs.status,
    attempts: backgroundJobs.attempts,
    maxAttempts: backgroundJobs.maxAttempts,
    failureCode: backgroundJobs.failureCode,
    datasetVersionId: backgroundJobs.datasetVersionId,
    modelVersionId: backgroundJobs.modelVersionId,
    createdAt: backgroundJobs.createdAt,
  }
}

function durableSelection() {
  return {
    id: backgroundJobs.id,
    scope: backgroundJobs.scope,
    organizationId: backgroundJobs.organizationId,
    requestedByUserId: backgroundJobs.requestedByUserId,
    queue: backgroundJobs.queue,
    type: backgroundJobs.jobType,
    status: backgroundJobs.status,
    payload: backgroundJobs.payload,
    requestId: backgroundJobs.requestId,
    traceContext: backgroundJobs.traceContext,
    datasetVersionId: backgroundJobs.datasetVersionId,
    modelVersionId: backgroundJobs.modelVersionId,
    attempts: backgroundJobs.attempts,
    maxAttempts: backgroundJobs.maxAttempts,
    timeoutMs: backgroundJobs.timeoutMs,
    cancelRequestedAt: backgroundJobs.cancelRequestedAt,
    createdAt: backgroundJobs.createdAt,
  }
}

function toReference(row: ReturnType<typeof jobSelection> extends infer T ? { [K in keyof T]: unknown } : never): JobReference {
  return {
    id: String(row.id),
    type: String(row.type) as SystemJobType,
    queue: String(row.queue) as QueueName,
    status: String(row.status) as JobStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    failureCode: row.failureCode ? String(row.failureCode) : undefined,
    datasetVersionId: row.datasetVersionId ? String(row.datasetVersionId) : undefined,
    modelVersionId: row.modelVersionId ? String(row.modelVersionId) : undefined,
    createdAt: String(row.createdAt),
  }
}

function toDurableJob(row: ReturnType<typeof durableSelection> extends infer T ? { [K in keyof T]: unknown } : never): DurableJob {
  return {
    id: String(row.id),
    scope: String(row.scope) as DurableJob['scope'],
    organizationId: row.organizationId ? String(row.organizationId) : undefined,
    requestedByUserId: row.requestedByUserId ? String(row.requestedByUserId) : undefined,
    queue: String(row.queue) as QueueName,
    type: String(row.type) as SystemJobType,
    status: String(row.status) as JobStatus,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    requestId: row.requestId ? String(row.requestId) : undefined,
    traceContext: (row.traceContext ?? {}) as Record<string, string>,
    datasetVersionId: row.datasetVersionId ? String(row.datasetVersionId) : undefined,
    modelVersionId: row.modelVersionId ? String(row.modelVersionId) : undefined,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    timeoutMs: Number(row.timeoutMs),
    cancelRequestedAt: row.cancelRequestedAt ? String(row.cancelRequestedAt) : undefined,
    createdAt: String(row.createdAt),
  }
}

function summarizeQueues(
  jobs: Array<{ queue: string; status: JobStatus; createdAt: string }>,
  deadLetters: Array<{ queue: string }>,
): QueueStatusSummary[] {
  return Object.values(QueueNames).map((queue) => {
    const queueJobs = jobs.filter((job) => job.queue === queue)
    const summary: QueueStatusSummary = {
      queue,
      queued: countStatus(queueJobs, 'queued'),
      running: countStatus(queueJobs, 'running'),
      succeeded: countStatus(queueJobs, 'succeeded'),
      failed: countStatus(queueJobs, 'failed'),
      cancelled: countStatus(queueJobs, 'cancelled'),
      deadLetters: deadLetters.filter((job) => job.queue === queue).length,
    }
    const oldest = queueJobs
      .filter((job) => job.status === 'queued')
      .map((job) => job.createdAt)
      .sort()[0]
    if (oldest) summary.oldestQueuedAt = oldest
    return summary
  })
}

function countStatus(jobs: Array<{ status: JobStatus }>, status: JobStatus) {
  return jobs.filter((job) => job.status === status).length
}
