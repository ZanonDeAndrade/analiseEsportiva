import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('oito filas e politicas ficam centralizadas', async () => {
  const jobs = await read('backend/src/application/ports/jobs.ts')
  const policies = await read('backend/src/application/jobs/policies.ts')
  for (const queue of [
    'ingestion',
    'normalization',
    'training',
    'evaluation',
    'backtest',
    'export',
    'notification',
    'billing-reconciliation',
  ]) {
    assert.match(jobs, new RegExp(queue))
    assert.match(policies, new RegExp(queue.replaceAll('-', '_'), 'i'))
  }
  assert.match(policies, /jitter: 0\.5/)
})

test('worker e scheduler sao processos separados da API', async () => {
  const packageJson = JSON.parse(await read('package.json'))
  const worker = await read('backend/src/worker.ts')
  const scheduler = await read('backend/src/scheduler.ts')
  const http = await read('backend/src/httpApp.ts')
  assert.ok(packageJson.scripts['backend:worker'])
  assert.ok(packageJson.scripts['backend:scheduler'])
  assert.match(worker, /BullMqWorkers/)
  assert.match(scheduler, /enqueueScheduledSystemJob/)
  assert.doesNotMatch(http, /syncData\(|trainModel\(|evaluateModel\(|runBacktest\(/)
})

test('migracao fornece outbox, DLQ, cotas e idempotencia de efeitos', async () => {
  const migration = await read('backend/migrations/0007_bullmq_jobs.sql')
  assert.match(migration, /dead_letter_jobs/)
  assert.match(migration, /provider_api_usage/)
  assert.match(migration, /source_job_id/)
  assert.match(migration, /background_jobs_outbox_idx/)
  assert.doesNotMatch(migration, /dead_letter_jobs[\s\S]{0,800}\bpayload\b/i)
})

test('runbook cobre seguranca, operacao e rollback', async () => {
  const documentation = await read('docs/async-jobs.md')
  for (const term of [
    'noeviction',
    'backoff exponencial',
    'circuit breaker',
    'cotas',
    'cancelamento',
    'organization_id',
    'Rollback',
  ]) {
    assert.ok(documentation.toLowerCase().includes(term.toLowerCase()), `sem ${term}`)
  }
})
