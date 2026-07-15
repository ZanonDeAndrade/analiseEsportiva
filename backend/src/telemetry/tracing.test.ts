import assert from 'node:assert/strict'
import test from 'node:test'
import { propagation, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { extractTraceContext, injectTraceContext } from './tracing.js'

test('W3C trace context atravessa outbox e job sem carregar payload', () => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  const span = trace.wrapSpanContext({
    traceId: '11111111111111111111111111111111',
    spanId: '2222222222222222',
    traceFlags: TraceFlags.SAMPLED,
  })
  const carrier = injectTraceContext(trace.setSpan(ROOT_CONTEXT, span))
  assert.equal(
    carrier.traceparent,
    '00-11111111111111111111111111111111-2222222222222222-01',
  )
  assert.deepEqual(Object.keys(carrier), ['traceparent'])
  const extracted = trace.getSpan(extractTraceContext(carrier))?.spanContext()
  assert.equal(extracted?.traceId, '11111111111111111111111111111111')
})
