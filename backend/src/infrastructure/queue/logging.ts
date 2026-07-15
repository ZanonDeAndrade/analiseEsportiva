export interface SafeJobLogger {
  info(event: string, fields: Record<string, unknown>): void
  error(event: string, fields: Record<string, unknown>): void
}

export const consoleJobLogger: SafeJobLogger = {
  info(event, fields) {
    console.log(JSON.stringify(sanitizeTelemetryFields({
      level: 'info', event, ...defined(fields), ...activeTraceIds(),
    })))
  },
  error(event, fields) {
    console.error(JSON.stringify(sanitizeTelemetryFields({
      level: 'error', event, ...defined(fields), ...activeTraceIds(),
    })))
  },
}

function defined(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}
import { sanitizeTelemetryFields } from '../../telemetry/redaction.js'
import { activeTraceIds } from '../../telemetry/tracing.js'
