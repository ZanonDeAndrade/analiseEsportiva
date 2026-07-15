import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('telemetria cobre correlação, redação, métricas e tracing ponta a ponta', async () => {
  const [logging, redaction, metrics, worker, migration, instrumentation] = await Promise.all([
    read('backend/src/interfaces/http/fastify/plugins/logging.ts'),
    read('backend/src/telemetry/redaction.ts'),
    read('backend/src/telemetry/metrics.ts'),
    read('backend/src/infrastructure/queue/workerRuntime.ts'),
    read('backend/migrations/0008_observability_trace_context.sql'),
    read('backend/src/telemetry/instrumentation.ts'),
  ])
  for (const field of ['requestId', 'userId', 'organizationId', 'durationMs']) assert.match(logging, new RegExp(field))
  for (const field of ['jobId', 'datasetVersion', 'modelVersion', 'extractTraceContext']) assert.match(worker, new RegExp(field))
  for (const signal of ['http_requests_total', 'queue_depth', 'insufficient_data', 'webhook_events', 'quota_ratio']) assert.match(metrics, new RegExp(signal))
  assert.match(redaction, /authorization.*cookie.*password.*token.*secret/i)
  assert.match(migration, /trace_context jsonb/i)
  assert.match(instrumentation, /OTLPTraceExporter/)
  assert.match(instrumentation, /sendDefaultPii: false/)
})

test('alertas e runbook cobrem os sete cenários e confirmação humana', async () => {
  const [rules, catalog, runbook, drill, docs] = await Promise.all([
    read('ops/observability/prometheus-alerts.yml'),
    read('ops/observability/alert-catalog.yml'),
    read('docs/observability-runbook.md'),
    read('scripts/alert-drill.mjs'),
    read('docs/observability.md'),
  ])
  for (const alert of ['ApiUnavailable', 'QueueStalled', 'HttpErrorRateHigh', 'HttpP99Degraded', 'DependencyUnavailable', 'SportsDataStale', 'ProviderQuotaNearLimit', 'BillingWebhookFailure']) {
    assert.match(rules, new RegExp(alert))
  }
  assert.match(catalog, /backup_failure/)
  for (let scenario = 1; scenario <= 7; scenario += 1) assert.match(runbook, new RegExp(`## ${scenario}\\.`))
  assert.match(runbook, /select[\s\S]+from ops\.audit_log/i)
  assert.match(runbook, /promql/i)
  assert.match(drill, /alert_drill_human_acknowledged/)
  assert.match(docs, /HTTP 2xx de entrega não é aceito como evidência humana/)
})

test('source maps são enviados de forma privada e excluídos da imagem', async () => {
  const [workflow, dockerfile, tsconfig] = await Promise.all([
    read('.github/workflows/ci-cd.yml'),
    read('Dockerfile'),
    read('backend/tsconfig.json'),
  ])
  assert.match(workflow, /sentry-cli sourcemaps upload/)
  assert.match(dockerfile, /find backend\/dist -type f -name '\*\.map' -delete/)
  assert.match(tsconfig, /"sourceMap": true/)
})

