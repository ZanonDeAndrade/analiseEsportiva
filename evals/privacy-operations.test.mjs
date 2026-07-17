import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8')

test('exportacao LGPD e exclusao falham fechadas para cache e object storage', async () => {
  const [route, coordinator, account] = await Promise.all([
    read('backend', 'src', 'interfaces', 'http', 'fastify', 'routes', 'privacy.ts'),
    read('backend', 'src', 'application', 'privacyCoordinator.ts'),
    read('frontend', 'src', 'components', 'AccountPanel.tsx'),
  ])
  assert.match(route, /private, no-store/)
  assert.match(coordinator, /await this\.deleteObjects\(plan\.objectKeys\)[\s\S]*await this\.cache\.purgeUser[\s\S]*eraseUserActiveData/)
  assert.match(coordinator, /object_storage_unavailable/)
  assert.match(account, /invalidateApiCache\(\)/)
})

test('retencao diaria usa worker estreito e nao apaga billing ou audit genericamente', async () => {
  const [scheduler, jobs, migration] = await Promise.all([
    read('backend', 'src', 'scheduler.ts'),
    read('backend', 'src', 'application', 'ports', 'jobs.ts'),
    read('backend', 'migrations', '0013_breezy_next_avengers.sql'),
  ])
  assert.match(scheduler, /PRIVACY_RETENTION/)
  assert.match(jobs, /privacy-retention/)
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/)
  assert.doesNotMatch(migration, /DELETE FROM billing\./)
  assert.doesNotMatch(migration, /DELETE FROM ops\.audit_log/)
})

test('status page e ativos nao dependem da aplicacao ou de terceiros', async () => {
  const [html, script, documentation] = await Promise.all([
    read('status-page', 'index.html'),
    read('status-page', 'status.js'),
    read('docs', 'support-operations.md'),
  ])
  assert.doesNotMatch(html, /https?:\/\//)
  assert.match(script, /status\.json/)
  assert.doesNotMatch(script, /analytics|google|segment|sentry/i)
  assert.match(documentation, /conta\/origem separadas/)
})

test('inventario, backups, onze runbooks e revisao profissional ficam explicitos', async () => {
  const [privacy, runbooks, legal] = await Promise.all([
    read('docs', 'privacy-lgpd-controls.md'),
    read('docs', 'operations-runbooks.md'),
    read('frontend', 'src', 'legal', 'legal-config.ts'),
  ])
  for (const term of ['Inventário', 'Fluxo e operadores', 'Backups e exclusão', 'REVISÃO JURÍDICA OBRIGATÓRIA']) {
    assert.match(privacy, new RegExp(term, 'i'))
  }
  assert.equal((runbooks.match(/^## \d+\./gm) ?? []).length, 11)
  assert.match(legal, /REVIS/) 
})
