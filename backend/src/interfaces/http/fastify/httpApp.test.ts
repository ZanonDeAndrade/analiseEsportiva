import assert from 'node:assert/strict'
import test from 'node:test'
import type { IdentityService } from '../../../application/identityService.js'
import { IdentityError } from '../../../application/identityErrors.js'
import type { OrganizationService } from '../../../application/organizationService.js'
import type { ActorContext } from '../../../application/ports/identity.js'
import type { PersistenceRepositories } from '../../../application/ports/persistence.js'
import type { DatabaseConnection } from '../../../infrastructure/database/client.js'
import { createBetIntelHttpServer, type HttpServerDependencies } from '../../../httpApp.js'

const owner: ActorContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'owner',
  provider: 'auth0',
  subject: 'auth0|fastify-test',
  sessionId: 'fastify-test-session',
  tokenExpiresAt: '2027-01-01T00:00:00.000Z',
}

test('schemas inválidos retornam problem padronizado com requestId', async () => {
  const app = testApp()
  const response = await app.inject({
    method: 'POST',
    url: '/v1/organizations',
    headers: authHeaders(),
    payload: { name: 'A', tenant_id: 'forged' },
  })
  assert.equal(response.statusCode, 400)
  assert.match(response.headers['content-type'] ?? '', /application\/problem\+json/)
  const payload = response.json()
  assert.equal(payload.code, 'validation_error')
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(response.headers['x-request-id'], payload.requestId)
  assert.equal('stack' in payload, false)
  await app.close()
})

test('autenticação e autorização são hooks separados e falham fechados', async () => {
  const missingAuth = testApp()
  const unauthenticated = await missingAuth.inject({ method: 'GET', url: '/v1/me' })
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(unauthenticated.json().code, 'authentication_required')
  await missingAuth.close()

  const viewerApp = testApp({ actor: { ...owner, role: 'viewer' } })
  const forbidden = await viewerApp.inject({
    method: 'POST',
    url: '/v1/admin/jobs/model-training',
    headers: { ...authHeaders(), 'idempotency-key': 'viewer-test-123' },
  })
  assert.equal(forbidden.statusCode, 403, forbidden.body)
  assert.equal(forbidden.json().code, 'forbidden')
  const queuePanel = await viewerApp.inject({
    method: 'GET',
    url: '/v1/admin/queues',
    headers: authHeaders(),
  })
  assert.equal(queuePanel.statusCode, 403)
  await viewerApp.close()
})

test('rate limit global produz erro estável', async () => {
  const app = testApp({ rateLimitMax: 1 })
  assert.equal((await app.inject({ method: 'GET', url: '/v1/me', headers: authHeaders() })).statusCode, 200)
  const limited = await app.inject({ method: 'GET', url: '/v1/me', headers: authHeaders() })
  assert.equal(limited.statusCode, 429, limited.body)
  assert.equal(limited.json().code, 'rate_limit_exceeded')
  assert.match(limited.headers['content-type'] ?? '', /application\/problem\+json/)
  await app.close()
})

test('liveness independe das dependências e readiness falha com PostgreSQL ou Redis', async () => {
  const databaseDown = testApp({
    environment: 'production',
    databaseCheck: async () => { throw new Error('database unavailable') },
    redisCheck: async () => 'PONG',
  })
  const live = await databaseDown.inject('/v1/health/live')
  assert.equal(live.statusCode, 200)
  assert.match(live.headers['strict-transport-security'] ?? '', /max-age=31536000/)
  const databaseReadiness = await databaseDown.inject('/v1/health/ready')
  assert.equal(databaseReadiness.statusCode, 503)
  assert.equal(databaseReadiness.json().dependencies.postgresql, 'down')
  await databaseDown.close()

  const redisDown = testApp({
    environment: 'production',
    redisCheck: async () => { throw new Error('redis unavailable') },
  })
  const redisReadiness = await redisDown.inject('/v1/health/ready')
  assert.equal(redisReadiness.statusCode, 503)
  assert.equal(redisReadiness.json().dependencies.redis, 'down')
  await redisDown.close()

  const ready = testApp({ environment: 'production', redisCheck: async () => 'PONG' })
  assert.equal((await ready.inject('/v1/health/ready')).statusCode, 200)
  await ready.close()
})

test('payload excessivo e content-type incorreto são recusados', async () => {
  const app = testApp({ bodyLimit: 64 })
  const oversized = await app.inject({
    method: 'POST',
    url: '/v1/predictions',
    headers: authHeaders(),
    payload: { homeTeam: 'A'.repeat(100), awayTeam: 'B' },
  })
  assert.equal(oversized.statusCode, 413)
  assert.equal(oversized.json().code, 'payload_too_large')

  const wrongType = await app.inject({
    method: 'POST',
    url: '/v1/predictions',
    headers: { authorization: 'Bearer test-token', 'content-type': 'text/plain' },
    payload: '{}',
  })
  assert.equal(wrongType.statusCode, 415)
  assert.equal(wrongType.json().code, 'unsupported_media_type')
  await app.close()
})

test('timeout encerra resposta lenta sem executar fallback pesado', async () => {
  const app = testApp({
    requestTimeoutMs: 10,
    listCompetitions: () => new Promise((resolve) => setTimeout(() => resolve([]), 40)),
  })
  const response = await app.inject({
    method: 'GET',
    url: '/v1/competitions',
    headers: authHeaders(),
  })
  assert.equal(response.statusCode, 504)
  assert.equal(response.json().code, 'request_timeout')
  await app.close()
})

test('erro interno não vaza stack ou mensagem em produção', async () => {
  const app = testApp({
    environment: 'production',
    listCompetitions: async () => {
      throw new Error('sql-password=super-secret')
    },
  })
  const response = await app.inject({
    method: 'GET',
    url: '/v1/competitions',
    headers: authHeaders(),
  })
  assert.equal(response.statusCode, 500)
  assert.equal(response.json().code, 'internal_error')
  assert.doesNotMatch(response.body, /super-secret|stack|sql-password/i)
  await app.close()
})

test('OpenAPI nasce dos schemas e rotas legadas ficam sob feature flag', async () => {
  const app = testApp({ environment: 'test' })
  await app.ready()
  const document = app.swagger() as { paths: Record<string, unknown>; components?: Record<string, unknown> }
  for (const path of [
    '/v1/fixtures',
    '/v1/predictions',
    '/v1/evaluations/latest',
    '/v1/models/active',
    '/v1/organizations',
    '/v1/account/sessions',
    '/v1/billing/portal',
    '/v1/admin/jobs/model-training',
    '/v1/admin/queues',
  ]) {
    assert.ok(document.paths[path], `OpenAPI sem ${path}`)
  }
  assert.equal((await app.inject({ method: 'GET', url: '/docs/json', headers: authHeaders() })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/train', headers: authHeaders() })).statusCode, 404)
  await app.close()

  const compatibilityApp = testApp({ environment: 'test', legacyRoutesEnabled: true })
  const legacy = await compatibilityApp.inject('/health')
  assert.equal(legacy.statusCode, 200)
  assert.equal(legacy.headers.deprecation, 'true')
  assert.match(String(legacy.headers.sunset ?? ''), /15 Oct 2026/)
  await compatibilityApp.close()
})

test('rotas administrativas apenas enfileiram e idempotência reaproveita o job', async () => {
  let calls = 0
  const app = testApp({
    enqueue: async (_actor, type) => {
      calls += 1
      return { id: '22222222-2222-4222-8222-222222222222', type, status: 'queued', createdAt: '2026-07-15T00:00:00.000Z' }
    },
  })
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/jobs/model-training',
    headers: { ...authHeaders(), 'idempotency-key': 'training-request-1' },
  })
  assert.equal(response.statusCode, 202, response.body)
  assert.equal(response.json().status, 'queued')
  assert.equal(calls, 1)
  await app.close()
})

test('métricas exigem credencial de serviço e não usam token de usuário', async () => {
  const metricsToken = '0123456789abcdef0123456789abcdef'
  const app = testApp({ metricsBearerToken: metricsToken })
  assert.equal((await app.inject('/v1/internal/metrics')).statusCode, 401)
  assert.equal((await app.inject({
    method: 'GET',
    url: '/v1/internal/metrics',
    headers: authHeaders(),
  })).statusCode, 401)
  const metrics = await app.inject({
    method: 'GET',
    url: '/v1/internal/metrics',
    headers: { authorization: `Bearer ${metricsToken}` },
  })
  assert.equal(metrics.statusCode, 200, metrics.body)
  assert.match(metrics.headers['content-type'] ?? '', /text\/plain/)
  assert.match(metrics.body, /betintel_http_requests_total/)
  await app.close()
})

function testApp(options: {
  actor?: ActorContext
  environment?: string
  rateLimitMax?: number
  bodyLimit?: number
  requestTimeoutMs?: number
  legacyRoutesEnabled?: boolean
  listCompetitions?: () => Promise<unknown[]>
  enqueue?: PersistenceRepositories['jobs']['enqueueSystemJob']
  databaseCheck?: () => Promise<unknown>
  redisCheck?: () => Promise<unknown>
  metricsBearerToken?: string
} = {}) {
  const actor = options.actor ?? owner
  const identityService = {
    authenticate: async (authorization: string | undefined) => {
      if (!authorization) {
        throw new IdentityError('authentication_required', 'Autenticação necessária.', 401)
      }
      return actor
    },
  } as unknown as IdentityService
  const repositories = {
    sports: {
      listCompetitions: options.listCompetitions ?? (async () => []),
      listFixtures: async () => [],
      findFixture: async () => null,
    },
    models: {
      getActiveModel: async () => null,
      getLatestEvaluation: async () => null,
    },
    jobs: {
      enqueueSystemJob: options.enqueue ?? (async (_actor: ActorContext, type: 'sports-sync') => ({
        id: '22222222-2222-4222-8222-222222222222',
        type,
        status: 'queued' as const,
        createdAt: '2026-07-15T00:00:00.000Z',
      })),
      getSystemJob: async () => null,
      cancelSystemJob: async () => false,
      listQueueStatus: async () => [],
    },
  } as unknown as PersistenceRepositories
  const dependencies: HttpServerDependencies = {
    connection: {
      pool: { query: options.databaseCheck ?? (async () => ({ rows: [{ '?column?': 1 }] })) },
    } as unknown as DatabaseConnection,
    repositories,
    identityService,
    organizationService: {} as OrganizationService,
    corsAllowedOrigins: ['http://localhost:5173'],
    requestIpHashKey: 'test-only-ip-hash-key',
    environment: options.environment ?? 'test',
    rateLimitMax: options.rateLimitMax,
    bodyLimit: options.bodyLimit,
    requestTimeoutMs: options.requestTimeoutMs,
    legacyRoutesEnabled: options.legacyRoutesEnabled,
    logger: false,
    readinessRedis: options.redisCheck ? { ping: options.redisCheck } : undefined,
    metricsBearerToken: options.metricsBearerToken,
  }
  return createBetIntelHttpServer(dependencies)
}

function authHeaders() {
  return { authorization: 'Bearer test-token' }
}
