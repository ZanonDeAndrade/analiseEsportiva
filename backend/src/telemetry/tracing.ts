import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
} from '@opentelemetry/api'

const tracer = trace.getTracer('betintel-application')

export function activeTraceIds() {
  const span = trace.getSpan(context.active())
  const spanContext = span?.spanContext()
  return spanContext && spanContext.traceId !== '00000000000000000000000000000000'
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : {}
}

export function injectTraceContext(source: Context = context.active()): Record<string, string> {
  const carrier: Record<string, string> = {}
  propagation.inject(source, carrier)
  return carrier
}

export function extractTraceContext(carrier: Record<string, string> | undefined): Context {
  return carrier ? propagation.extract(context.active(), carrier) : context.active()
}

export function withSpan<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
  options: { kind?: SpanKind; parent?: Context } = {},
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { kind: options.kind ?? SpanKind.INTERNAL, attributes },
    options.parent ?? context.active(),
    async (span) => {
      try {
        const result = await operation()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
        span.recordException(error instanceof Error ? error : new Error('unknown_error'))
        throw error
      } finally {
        span.end()
      }
    },
  )
}
