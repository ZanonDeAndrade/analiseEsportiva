import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import type { IdentityService } from '../../../application/identityService.js'
import { IdentityError } from '../../../application/identityErrors.js'
import type { OrganizationService } from '../../../application/organizationService.js'
import type { ActorContext } from '../../../application/ports/identity.js'
import type { PersistenceRepositories } from '../../../application/ports/persistence.js'
import type { LegalRepository } from '../../../application/ports/legal.js'
import type { WorkspaceRepository } from '../../../application/ports/workspace.js'
import type { OperationsRepository } from '../../../application/ports/operations.js'
import type { PrivacyRepository } from '../../../application/ports/privacy.js'
import type { BillingPortalGateway } from './routes/billing.js'
import type { StripeWebhookGateway } from './routes/stripeWebhooks.js'
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
    '/v1/legal/status',
    '/v1/legal/acceptances',
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

test('documentos jurídicos são públicos e aceite usa ator e horário do servidor', async () => {
  let recordedActor: ActorContext | undefined
  let recordedInput: Parameters<LegalRepository['recordAcceptances']>[1] | undefined
  const acceptedAt = '2026-07-16T03:00:00.000Z'
  const app = testApp({
    recordAcceptances: async (actor, input) => {
      recordedActor = actor
      recordedInput = input
      return legalDocuments().map((document) => ({
        id: randomUUID(), evidenceEventId: '33333333-3333-4333-8333-333333333333',
        userId: actor.userId, organizationId: actor.organizationId, legalDocumentId: document.id,
        documentType: document.type, documentVersion: document.version,
        acceptanceGroup: document.acceptanceGroup, acceptancePurpose: input.purpose,
        acceptedAt, contentHash: document.contentHash, documentUrl: document.documentUrl,
        evidenceMetadata: { origin: input.evidence.origin },
      }))
    },
  })
  const publicDocuments = await app.inject('/v1/legal/documents')
  assert.equal(publicDocuments.statusCode, 200, publicDocuments.body)
  assert.equal(publicDocuments.json().documents.length, 3)

  const response = await app.inject({
    method: 'POST', url: '/v1/legal/acceptances',
    headers: { ...authHeaders(), 'idempotency-key': 'legal-test-acceptance-1' },
    payload: legalAcceptancePayload(),
  })
  assert.equal(response.statusCode, 201, response.body)
  assert.equal(response.json().acceptedAt, acceptedAt)
  assert.equal(recordedActor?.userId, owner.userId)
  assert.equal(recordedActor?.organizationId, owner.organizationId)
  assert.equal(recordedInput?.idempotencyKey, 'legal-test-acceptance-1')
  assert.equal('acceptedAt' in (recordedInput ?? {}), false)
  await app.close()
})

test('aceite incompleto ou falha de persistência nunca libera sucesso', async () => {
  const incomplete = testApp({ recordAcceptances: async () => [] })
  const response = await incomplete.inject({
    method: 'POST', url: '/v1/legal/acceptances',
    headers: { ...authHeaders(), 'idempotency-key': 'legal-incomplete-1' },
    payload: legalAcceptancePayload(),
  })
  assert.equal(response.statusCode, 500)
  await incomplete.close()

  const invalid = testApp({ recordAcceptances: async (_actor, input) => {
    if (!input.declarations.age18) {
      throw new IdentityError('invalid_legal_acceptance', 'Maioridade obrigatória.', 409)
    }
    return []
  } })
  const payload = legalAcceptancePayload()
  payload.declarations.age18 = false
  const rejected = await invalid.inject({
    method: 'POST', url: '/v1/legal/acceptances',
    headers: { ...authHeaders(), 'idempotency-key': 'legal-invalid-1' }, payload,
  })
  assert.equal(rejected.statusCode, 409)
  await invalid.close()
})

test('cancelamento recorrente exige gateway e retorna efeitos transparentes', async () => {
  const unavailable = testApp()
  const noGateway = await unavailable.inject({
    method: 'POST', url: '/v1/billing/subscription/cancel',
    headers: { ...authHeaders(), 'idempotency-key': 'cancel-no-gateway' },
  })
  assert.equal(noGateway.statusCode, 503)
  await unavailable.close()

  const app = testApp({ billingPortal: {
    createPortal: async () => ({ url: 'https://example.invalid', expiresAt: '2026-07-16T04:00:00.000Z' }),
    getSubscription: async () => ({
      planName: 'Plano teste', status: 'active', priceMinor: 1000, currency: 'BRL', interval: 'month',
      currentPeriodEnd: '2026-08-16T00:00:00.000Z', cancelAtPeriodEnd: false,
      refundPolicy: '[POLÍTICA DE REEMBOLSO]',
    }),
    cancelSubscription: async () => ({
      planName: 'Plano teste', requestedAt: '2026-07-16T03:00:00.000Z',
      accessUntil: '2026-08-16T00:00:00.000Z', refundPolicy: '[POLÍTICA DE REEMBOLSO]',
      dataEffects: '[VALIDAR]', canReactivate: true, notificationStatus: 'not_configured',
    }),
  } })
  const cancelled = await app.inject({
    method: 'POST', url: '/v1/billing/subscription/cancel',
    headers: { ...authHeaders(), 'idempotency-key': 'cancel-configured-1' },
  })
  assert.equal(cancelled.statusCode, 200, cancelled.body)
  assert.match(cancelled.json().confirmation, /renovação automática foi interrompida/)
  assert.equal(cancelled.json().cancellation.notificationStatus, 'not_configured')
  await app.close()
})

test('catalogo de planos vem do servidor mesmo antes de habilitar checkout', async () => {
  const app = testApp()
  const response = await app.inject({
    method: 'GET', url: '/v1/billing/overview', headers: authHeaders(),
  })
  assert.equal(response.statusCode, 200, response.body)
  const payload = response.json()
  assert.equal(payload.configured, false)
  assert.deepEqual(payload.overview.plans.map((plan: { planKey: string; priceMinor: number; monthlyEquivalentMinor: number }) => [plan.planKey, plan.priceMinor, plan.monthlyEquivalentMinor]), [
    ['brasileirao', 1990, 1990],
    ['todas-ligas', 3990, 3990],
    ['brasileirao-anual', 17880, 1490],
    ['todas-ligas-anual', 41880, 3490],
  ])
  assert.deepEqual(payload.overview.plans[0].entitlements.leagueIds, ['BRA'])
  assert.deepEqual(payload.overview.plans[1].entitlements.leagueIds, ['BRA', 'PL', 'LL', 'L1', 'BUN'])
  assert.equal(payload.overview.plans[2].savingsMinor, 6000)
  assert.equal(payload.overview.plans[3].savingsMinor, 6000)
  await app.close()
})

test('checkout exige aceite recorrente e persiste preço resolvido no servidor', async () => {
  let accepted: Parameters<LegalRepository['recordAcceptances']>[1] | undefined
  let checkoutPlan: string | undefined
  const billingPortal: BillingPortalGateway = {
    createPortal: async () => ({ url: 'https://billing.stripe.test', expiresAt: '2026-07-20T00:00:00.000Z' }),
    createCheckout: async (_actor, planKey) => {
      checkoutPlan = planKey
      return { url: 'https://checkout.stripe.test', expiresAt: '2026-07-20T00:00:00.000Z' }
    },
  }
  const app = testApp({
    billingPortal,
    recordAcceptances: async (actor, input) => {
      accepted = input
      return legalDocuments().map((document) => ({
        id: randomUUID(), evidenceEventId: randomUUID(), userId: actor.userId,
        organizationId: actor.organizationId, legalDocumentId: document.id,
        documentType: document.type, documentVersion: document.version,
        acceptanceGroup: document.acceptanceGroup, acceptancePurpose: input.purpose,
        acceptedAt: new Date().toISOString(), contentHash: document.contentHash,
        documentUrl: document.documentUrl, evidenceMetadata: {},
      }))
    },
  })
  const missingConsent = await app.inject({
    method: 'POST', url: '/v1/billing/checkout',
    headers: { ...authHeaders(), 'idempotency-key': 'checkout-without-consent' },
    payload: { planKey: 'brasileirao', recurringBillingAccepted: false },
  })
  assert.equal(missingConsent.statusCode, 400)

  const response = await app.inject({
    method: 'POST', url: '/v1/billing/checkout',
    headers: { ...authHeaders(), 'idempotency-key': 'checkout-with-consent' },
    payload: { planKey: 'brasileirao', recurringBillingAccepted: true },
  })
  assert.equal(response.statusCode, 201, response.body)
  assert.equal(checkoutPlan, 'brasileirao')
  assert.equal(accepted?.purpose, 'subscription')
  assert.equal(accepted?.declarations.recurringBilling, true)
  assert.equal(accepted?.evidence.priceMinor, 1990)
  assert.equal(accepted?.evidence.currency, 'BRL')
  await app.close()
})

test('webhook Stripe é público e entrega os bytes exatos ao verificador', async () => {
  let receivedBody = ''
  let receivedSignature = ''
  const app = testApp({
    stripeWebhook: {
      processWebhook: async (body, signature) => {
        receivedBody = body.toString('utf8')
        receivedSignature = signature
        return { duplicate: false }
      },
    },
  })
  const rawBody = '{"id":"evt_raw_test","type":"invoice.paid"}'
  const response = await app.inject({
    method: 'POST', url: '/webhooks/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=test' },
    payload: rawBody,
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(receivedBody, rawBody)
  assert.equal(receivedSignature, 't=1,v1=test')
  await app.close()
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

test('workspace SaaS aplica permissao do servidor e nunca ativa alerta sem entrega', async () => {
  const app = testApp()
  const listed = await app.inject({ method: 'GET', url: '/v1/saved-queries', headers: authHeaders() })
  assert.equal(listed.statusCode, 200)
  assert.deepEqual(listed.json(), { queries: [] })
  const alert = await app.inject({
    method: 'POST', url: '/v1/alerts', headers: { ...authHeaders(), 'content-type': 'application/json' },
    payload: { name: 'Mudanca relevante', channel: 'email' },
  })
  assert.equal(alert.statusCode, 201)
  assert.equal(alert.json().status, 'paused')
  assert.equal(alert.json().deliveryState, 'not_configured')
  await app.close()

  const viewerApp = testApp({ actor: { ...owner, role: 'viewer' } })
  const forbidden = await viewerApp.inject({
    method: 'POST', url: '/v1/saved-queries', headers: { ...authHeaders(), 'content-type': 'application/json' },
    payload: { name: 'Nao autorizado', filters: { league: 'todas', period: 'todos', market: '1X2', query: '' } },
  })
  assert.equal(forbidden.statusCode, 403)
  await viewerApp.close()
})

test('exportacao do titular nao usa cache e control plane exige allowlist adicional', async () => {
  const app = testApp()
  const exported = await app.inject({ method: 'GET', url: '/v1/privacy/export', headers: authHeaders() })
  assert.equal(exported.statusCode, 200, exported.body)
  assert.match(exported.headers['cache-control'] ?? '', /no-store/)
  assert.equal(exported.json().schemaVersion, '1.0')
  await app.close()

  const tenantOwnerOnly = testApp({ platformAdminSubjects: [] })
  const forbidden = await tenantOwnerOnly.inject({ method: 'GET', url: '/v1/admin/queues', headers: authHeaders() })
  assert.equal(forbidden.statusCode, 403)
  await tenantOwnerOnly.close()
})

test('suporte cria chamado pelo tenant sem aceitar campos extras', async () => {
  const app = testApp()
  const created = await app.inject({
    method: 'POST', url: '/v1/support/tickets',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    payload: { category: 'privacy', severity: 'sev3', subject: 'Corrigir cadastro', description: 'O nome verificado precisa ser corrigido.' },
  })
  assert.equal(created.statusCode, 201, created.body)
  assert.equal(created.json().category, 'privacy')
  const invalid = await app.inject({
    method: 'POST', url: '/v1/support/tickets',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    payload: { category: 'privacy', severity: 'sev3', subject: 'Corrigir cadastro', description: 'Descricao suficiente', email: 'pii@example.test' },
  })
  assert.equal(invalid.statusCode, 201)
  assert.equal('email' in invalid.json(), false)
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
  recordAcceptances?: LegalRepository['recordAcceptances']
  billingPortal?: BillingPortalGateway
  stripeWebhook?: StripeWebhookGateway
  platformAdminSubjects?: string[]
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
    legal: {
      listDocuments: async () => legalDocuments(),
      acceptanceStatus: async () => ({
        requiresAcceptance: true,
        requiredDocuments: legalDocuments(),
        missingDocumentTypes: ['terms', 'privacy', 'risk'],
      }),
      recordAcceptances: options.recordAcceptances ?? (async (actor, input) => legalDocuments().map((document) => ({
        id: randomUUID(), evidenceEventId: randomUUID(), userId: actor.userId,
        organizationId: actor.organizationId, legalDocumentId: document.id,
        documentType: document.type, documentVersion: document.version,
        acceptanceGroup: document.acceptanceGroup, acceptancePurpose: input.purpose,
        acceptedAt: new Date().toISOString(), contentHash: document.contentHash,
        documentUrl: document.documentUrl, evidenceMetadata: {},
      }))),
      listAcceptances: async () => [],
      findAcceptance: async () => null,
    },
    workspace: {
      listSavedQueries: async () => [],
      createSavedQuery: async (actor, name, filters) => ({
        id: randomUUID(),
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        name,
        filters,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      deleteSavedQuery: async () => false,
      listAlertRules: async () => [],
      createAlertRule: async (actor, input) => ({
        id: randomUUID(),
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        savedQueryId: input.savedQueryId,
        name: input.name,
        channel: input.channel,
        status: 'paused' as const,
        deliveryState: 'not_configured' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      deleteAlertRule: async () => false,
    } satisfies WorkspaceRepository,
    operations: {
      createSupportTicket: async (actor, input) => ({
        id: randomUUID(), ...input, status: 'open' as const,
        ownerTeam: input.category === 'privacy' ? 'privacy' as const : 'support' as const,
        slaDueAt: '2026-07-16T08:00:00.000Z', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
      }),
      listOwnSupportTickets: async () => [], listSupportTickets: async () => [],
      updateSupportTicket: async () => null, listAudit: async () => [], listIncidents: async () => [],
      createIncident: async () => { throw new Error('not_used') }, updateIncident: async () => null,
    } satisfies OperationsRepository,
    privacy: {
      exportSubjectData: async (actor) => ({
        schemaVersion: '1.0' as const, generatedAt: '2026-07-16T00:00:00.000Z', validUntil: '2026-07-16T00:05:00.000Z',
        subject: { id: actor.userId }, organizations: [{ organizationId: actor.organizationId }], sessions: [],
        legalAcceptances: [], savedQueries: [], alerts: [], supportTickets: [], exports: [], jobs: [], auditTrail: [], retentionNotices: [],
      }),
      planUserErasure: async () => ({ organizationIds: [], objectKeys: [] }), eraseUserActiveData: async () => undefined,
      planOrganizationErasure: async () => ({ organizationIds: [], objectKeys: [] }), eraseOrganizationActiveData: async () => undefined,
      expiredObjectKeys: async () => [], purgeExpired: async () => ({ sessions: 0, invitations: 0, exports: 0, supportTickets: 0, incidents: 0, jobs: 0 }),
    } satisfies PrivacyRepository,
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
    platformAdminSubjects: options.platformAdminSubjects ?? ['auth0|fastify-test'],
    rateLimitMax: options.rateLimitMax,
    bodyLimit: options.bodyLimit,
    requestTimeoutMs: options.requestTimeoutMs,
    legacyRoutesEnabled: options.legacyRoutesEnabled,
    logger: false,
    readinessRedis: options.redisCheck ? { ping: options.redisCheck } : undefined,
    metricsBearerToken: options.metricsBearerToken,
    billingPortal: options.billingPortal,
    stripeWebhook: options.stripeWebhook,
  }
  return createBetIntelHttpServer(dependencies)
}

function legalDocuments() {
  return [
    { type: 'terms' as const, version: '0.9', hash: '1'.repeat(64), url: '/termos-de-uso' },
    { type: 'privacy' as const, version: '0.1', hash: '2'.repeat(64), url: '/politica-de-privacidade' },
    { type: 'risk' as const, version: '0.9', hash: '3'.repeat(64), url: '/termos-de-uso#aviso-essencial' },
  ].map((item, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    type: item.type, version: item.version, title: item.type, contentHash: item.hash,
    documentUrl: item.url, acceptanceGroup: `${item.type}-${item.version}-material` as string,
    changeKind: 'material' as const, changeSummary: 'Minuta inicial.', isActive: true,
    createdAt: '2026-07-16T00:00:00.000Z',
  }))
}

function legalAcceptancePayload() {
  return {
    purpose: 'first_access' as const,
    documents: legalDocuments().map(({ type, version, contentHash }) => ({ type, version, contentHash })),
    declarations: { age18: true, termsAndPrivacy: true, risk: true },
    evidence: { origin: 'first_access' as const, riskVersion: '0.9', privacyVersion: '0.1' },
  }
}

function authHeaders() {
  return { authorization: 'Bearer test-token' }
}
