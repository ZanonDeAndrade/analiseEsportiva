import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('composition root usa Fastify, /v1 e plugins HTTP separados', async () => {
  const app = await read('backend/src/httpApp.ts')
  assert.match(app, /Fastify\(/)
  assert.match(app, /prefix: '\/v1'/)
  for (const plugin of [
    'securityPlugin',
    'errorPlugin',
    'safeLoggingPlugin',
    'observabilityPlugin',
    'rateLimitPlugin',
    'authenticationPlugin',
    'tenancyPlugin',
    'authorizationPlugin',
  ]) {
    assert.match(app, new RegExp(`register\\(${plugin}`))
  }
  assert.doesNotMatch(app, /createServer\s*\(/)
})

test('rotas pesadas apenas registram jobs e legado depende de feature flag', async () => {
  const app = await read('backend/src/httpApp.ts')
  const admin = await read('backend/src/interfaces/http/fastify/routes/admin.ts')
  const legacy = await read('backend/src/interfaces/http/fastify/routes/legacy.ts')
  assert.match(app, /legacyRoutesEnabled === true/)
  assert.match(admin, /enqueueSystemJob/)
  assert.match(admin, /reply\.code\(202\)/)
  assert.doesNotMatch(admin, /syncData|trainModel|evaluateModel|backtestModel/)
  assert.match(legacy, /deprecationHeaders/)
})

test('documentacao registra contrato, seguranca, limitacoes e rollback', async () => {
  const documentation = await read('docs/fastify-api.md')
  for (const term of [
    'application/problem+json',
    'requestId',
    'OpenAPI',
    'Redis',
    'BullMQ',
    'ENABLE_LEGACY_HTTP_ROUTES',
    'Rollback',
  ]) {
    assert.ok(documentation.toLowerCase().includes(term.toLowerCase()), `documentacao sem ${term}`)
  }
})
