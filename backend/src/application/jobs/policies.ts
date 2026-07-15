import {
  QueueNames,
  SystemJobTypes,
  queueForJobType,
  type QueueName,
  type SystemJobType,
} from '../ports/jobs.js'

export interface QueuePolicy {
  queue: QueueName
  concurrency: number
  attempts: number
  timeoutMs: number
  backoffDelayMs: number
  jitter: number
}

const policies: Record<QueueName, Omit<QueuePolicy, 'queue'>> = {
  [QueueNames.INGESTION]: policy(2, 5, 15 * 60_000),
  [QueueNames.NORMALIZATION]: policy(4, 3, 10 * 60_000),
  [QueueNames.TRAINING]: policy(1, 3, 30 * 60_000),
  [QueueNames.EVALUATION]: policy(2, 3, 20 * 60_000),
  [QueueNames.BACKTEST]: policy(1, 3, 30 * 60_000),
  [QueueNames.EXPORT]: policy(2, 3, 20 * 60_000),
  [QueueNames.NOTIFICATION]: policy(10, 5, 2 * 60_000),
  [QueueNames.BILLING_RECONCILIATION]: policy(2, 5, 10 * 60_000),
}

export function queuePolicy(queue: QueueName): QueuePolicy {
  return { queue, ...policies[queue] }
}

export function jobPolicy(type: SystemJobType): QueuePolicy {
  return queuePolicy(queueForJobType(type))
}

export const allQueuePolicies = Object.values(QueueNames).map(queuePolicy)

export const executableJobTypes = new Set<SystemJobType>([
  SystemJobTypes.SPORTS_SYNC,
  SystemJobTypes.SPORTS_NORMALIZATION,
  SystemJobTypes.MODEL_TRAINING,
  SystemJobTypes.EVALUATION,
  SystemJobTypes.BACKTEST,
])

function policy(
  concurrency: number,
  attempts: number,
  timeoutMs: number,
): Omit<QueuePolicy, 'queue'> {
  return { concurrency, attempts, timeoutMs, backoffDelayMs: 1_000, jitter: 0.5 }
}
