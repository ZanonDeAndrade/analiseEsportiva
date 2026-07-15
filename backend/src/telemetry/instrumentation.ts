import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import * as Sentry from '@sentry/node'
import { sanitizeTelemetryFields, sanitizeTelemetryString } from './redaction.js'

let sdk: NodeSDK | undefined
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'betintel-unknown'

if (otlpEndpoint) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'service.version': process.env.APP_RELEASE?.trim() || 'development',
      'deployment.environment.name': process.env.BETINTEL_ENVIRONMENT?.trim() || 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 30_000,
    })],
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    })],
  })
  sdk.start()
}

const sentryDsn = process.env.SENTRY_DSN?.trim()
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.BETINTEL_ENVIRONMENT?.trim() || 'development',
    release: process.env.APP_RELEASE?.trim() || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    beforeSend(event) {
      event.request = event.request
        ? {
            method: event.request.method,
            url: event.request.url ? sanitizeTelemetryString(event.request.url) : undefined,
          }
        : undefined
      event.extra = sanitizeTelemetryFields(event.extra) as typeof event.extra
      event.contexts = sanitizeTelemetryFields(event.contexts) as typeof event.contexts
      event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
        category: breadcrumb.category,
        level: breadcrumb.level,
        message: breadcrumb.message ? sanitizeTelemetryString(breadcrumb.message) : undefined,
        timestamp: breadcrumb.timestamp,
      }))
      if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined
      return event
    },
  })
}

export async function shutdownTelemetry(timeoutMs = 5_000) {
  const operations: Promise<unknown>[] = []
  if (sdk) operations.push(sdk.shutdown())
  if (sentryDsn) operations.push(Sentry.close(timeoutMs))
  await Promise.allSettled(operations)
}

