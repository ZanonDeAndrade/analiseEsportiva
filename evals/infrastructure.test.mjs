import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('imagem e compose preservam runtime minimo, non-root e migrations', async () => {
  const [dockerfile, ignore, compose] = await Promise.all([
    read('Dockerfile'),
    read('.dockerignore'),
    read('compose.dev.yaml'),
  ])
  assert.match(dockerfile, /AS build/)
  assert.match(dockerfile, /AS runtime/)
  assert.match(dockerfile, /node:24\.\d+\.\d+-bookworm-slim@sha256:[a-f0-9]{64}/)
  assert.match(dockerfile, /USER node/)
  assert.doesNotMatch(dockerfile, /COPY .*\.env/)
  assert.match(ignore, /^\.env$/m)
  assert.match(compose, /postgres:/)
  assert.match(compose, /redis:/)
  assert.match(compose, /condition: service_completed_successfully/)
  assert.match(compose, /profiles: \["disaster-recovery"\]/)
})

test('configuracao nao contem parser manual e entrypoints validam antes do boot', async () => {
  const [config, dev, server, worker, scheduler] = await Promise.all([
    read('backend/src/config.ts'),
    read('scripts/dev.mjs'),
    read('backend/src/server.ts'),
    read('backend/src/worker.ts'),
    read('backend/src/scheduler.ts'),
  ])
  assert.doesNotMatch(config + dev, /readFileSync|split\(\/\\r\?\\n\//)
  assert.match(server, /validateRuntimeConfiguration\('api'\)/)
  assert.match(worker, /validateRuntimeConfiguration\('worker'\)/)
  assert.match(scheduler, /validateRuntimeConfiguration\('scheduler'\)/)
})

test('pipeline fixa actions e cobre qualidade, imagem, deploy e rollback', async () => {
  const [workflow, deploy] = await Promise.all([
    read('.github/workflows/ci-cd.yml'),
    read('scripts/render-deploy.mjs'),
  ])
  for (const step of ['npm ci', 'npm run lint', 'npm run typecheck', 'test:integration', 'npm audit', 'trivy-action', 'deploy-staging', 'deploy-production']) {
    assert.ok(workflow.includes(step), 'workflow sem ' + step)
  }
  for (const use of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(use[1], /@[0-9a-f]{40}$/)
  }
  assert.match(deploy, /previousDeployId/)
  assert.match(deploy, /rollbackChanged/)
  assert.match(deploy, /FORCE_ROLLBACK_DRILL/)
  assert.match(deploy, /@sha256:/)
})

test('runbook define secrets, TLS, backup, restore, RPO, RTO e gates reais', async () => {
  const documentation = await read('docs/infrastructure-operations.md')
  for (const term of [
    'secret store',
    'HSTS',
    'PITR',
    'AES-256',
    'RPO',
    'RTO',
    'rollback_drill_passed',
    'npm run backup:drill',
    'produção não está aprovada',
  ]) {
    assert.ok(documentation.toLowerCase().includes(term.toLowerCase()), 'runbook sem ' + term)
  }
})
