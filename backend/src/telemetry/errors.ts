import * as Sentry from '@sentry/node'
import { sanitizeTelemetryFields, safeErrorCode } from './redaction.js'

export interface ErrorContext {
  component: 'http' | 'worker' | 'scheduler' | 'database' | 'redis' | 'external_api'
  requestId?: string
  jobId?: string
  userId?: string
  organizationId?: string
  route?: string
  method?: string
  queue?: string
  modelVersion?: string
  datasetVersion?: string
}

export function captureOperationalError(error: unknown, input: ErrorContext) {
  if (!process.env.SENTRY_DSN?.trim()) return
  const normalized = error instanceof Error ? error : new Error('unknown_error')
  const context = sanitizeTelemetryFields(input) as Record<string, unknown>
  Sentry.withScope((scope) => {
    scope.setLevel('error')
    scope.setTag('component', input.component)
    scope.setTag('error_code', safeErrorCode(normalized))
    if (input.route) scope.setTag('route', input.route)
    if (input.queue) scope.setTag('queue', input.queue)
    if (input.userId) scope.setUser({ id: input.userId })
    scope.setContext('correlation', context)
    Sentry.captureException(normalized)
  })
}

