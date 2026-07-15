import type { ActorContext } from './identity.js'

export const QueueNames = {
  INGESTION: 'ingestion',
  NORMALIZATION: 'normalization',
  TRAINING: 'training',
  EVALUATION: 'evaluation',
  BACKTEST: 'backtest',
  EXPORT: 'export',
  NOTIFICATION: 'notification',
  BILLING_RECONCILIATION: 'billing-reconciliation',
} as const

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames]

export const SystemJobTypes = {
  SPORTS_SYNC: 'sports-sync',
  SPORTS_NORMALIZATION: 'sports-normalization',
  MODEL_TRAINING: 'model-training',
  EVALUATION: 'evaluation',
  BACKTEST: 'backtest',
  EXPORT: 'export',
  NOTIFICATION: 'notification',
  BILLING_RECONCILIATION: 'billing-reconciliation',
} as const

export type SystemJobType = (typeof SystemJobTypes)[keyof typeof SystemJobTypes]
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface JobReference {
  id: string
  type: SystemJobType
  status: JobStatus
  createdAt: string
  queue?: QueueName
  attempts?: number
  maxAttempts?: number
  failureCode?: string
  datasetVersionId?: string
  modelVersionId?: string
}

export interface DurableJob {
  id: string
  scope: 'system' | 'organization'
  organizationId?: string
  requestedByUserId?: string
  queue: QueueName
  type: SystemJobType
  status: JobStatus
  payload: Record<string, unknown>
  requestId?: string
  traceContext?: Record<string, string>
  datasetVersionId?: string
  modelVersionId?: string
  attempts: number
  maxAttempts: number
  timeoutMs: number
  cancelRequestedAt?: string
  createdAt: string
}

export interface QueueStatusSummary {
  queue: QueueName
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  deadLetters: number
  oldestQueuedAt?: string
}

export interface JobQueue {
  enqueueSystemJob(
    actor: ActorContext,
    type: SystemJobType,
    idempotencyKey: string,
  ): Promise<JobReference>
  getSystemJob(actor: ActorContext, id: string): Promise<JobReference | null>
  cancelSystemJob(actor: ActorContext, id: string): Promise<boolean>
  listQueueStatus(actor: ActorContext): Promise<QueueStatusSummary[]>
}

export interface InternalJobStore {
  enqueueScheduledSystemJob(
    type: SystemJobType,
    idempotencyKey: string,
    payload?: Record<string, unknown>,
  ): Promise<JobReference>
  enqueueRelatedJob(input: {
    type: SystemJobType
    idempotencyKey: string
    payload?: Record<string, unknown>
    requestId?: string
    organizationId?: string
    requestedByUserId?: string
    datasetVersionId?: string
    modelVersionId?: string
    parentJobId?: string
  }): Promise<JobReference>
  pendingDispatch(limit: number): Promise<DurableJob[]>
  markDispatched(id: string): Promise<void>
  markDispatchFailure(id: string): Promise<void>
  markRunning(id: string, attempt: number): Promise<DurableJob | null>
  markRetrying(id: string, failureCode: string): Promise<void>
  markCancelled(id: string): Promise<void>
  markSucceeded(
    id: string,
    result?: { datasetVersionId?: string; modelVersionId?: string; metadata?: Record<string, unknown> },
  ): Promise<void>
  markDeadLetter(id: string, failureCode: string, attempts: number): Promise<void>
  isCancellationRequested(id: string): Promise<boolean>
  latestReadyDatasetVersionId(): Promise<string | null>
}

export function queueForJobType(type: SystemJobType): QueueName {
  if (type === SystemJobTypes.SPORTS_SYNC) return QueueNames.INGESTION
  if (type === SystemJobTypes.SPORTS_NORMALIZATION) return QueueNames.NORMALIZATION
  if (type === SystemJobTypes.MODEL_TRAINING) return QueueNames.TRAINING
  if (type === SystemJobTypes.EVALUATION) return QueueNames.EVALUATION
  if (type === SystemJobTypes.BACKTEST) return QueueNames.BACKTEST
  if (type === SystemJobTypes.EXPORT) return QueueNames.EXPORT
  if (type === SystemJobTypes.NOTIFICATION) return QueueNames.NOTIFICATION
  return QueueNames.BILLING_RECONCILIATION
}
