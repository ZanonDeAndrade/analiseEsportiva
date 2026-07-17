import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { after, before, test } from 'node:test'
import { join, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { and, eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { Redis } from 'ioredis'
import { QueueNames, SystemJobTypes } from '../../application/ports/jobs.js'
import { BullMqQueues } from '../queue/bullmq.js'
import { OutboxDispatcher } from '../queue/dispatcher.js'
import {
  ExternalProviderError,
  ExternalRequestGuard,
  RedisCircuitBreaker,
} from '../queue/externalRequests.js'
import type { SafeJobLogger } from '../queue/logging.js'
import { BullMqWorkers } from '../queue/workerRuntime.js'
import { PostgresProviderQuota } from './providerQuota.js'
import { PostgresTrainingLock, TrainingAlreadyRunningError } from './trainingLock.js'
import type { SportsImportBatch } from '../../application/ports/persistence.js'
import type {
  ActorContext,
  IdentityProvider,
  ProviderSession,
  ProviderUser,
  VerifiedIdentity,
} from '../../application/ports/identity.js'
import { IdentityError } from '../../application/identityErrors.js'
import { IdentityService } from '../../application/identityService.js'
import { OrganizationService } from '../../application/organizationService.js'
import { createBetIntelHttpServer, type HttpServerDependencies } from '../../httpApp.js'
import { buildFeatureTable } from '../../featureEngineering.js'
import { trainModel } from '../../training.js'
import { importLocalState } from '../../import/localStateImporter.js'
import { createDatabaseConnection, type DatabaseConnection } from './client.js'
import { createPostgresRepositories } from './repositories.js'
import {
  apiKeys,
  auditLog,
  backgroundJobs,
  datasetVersions,
  deadLetterJobs,
  exportsTable,
  invitations,
  incidents,
  invoices,
  memberships,
  modelVersions,
  organizations,
  plans,
  predictions,
  providerApiUsage,
  savedQueries,
  sessionMetadata,
  subscriptions,
  supportTickets,
  usageRecords,
  users,
  webhookEvents,
  alertRules,
} from './schema.js'

const baseUrl = process.env.TEST_DATABASE_URL
const requireDatabase = process.env.BETINTEL_REQUIRE_DB_TESTS === 'true'
const testRedisUrl = process.env.TEST_REDIS_URL
const skip = !baseUrl
  ? requireDatabase
    ? 'TEST_DATABASE_URL obrigatoria quando BETINTEL_REQUIRE_DB_TESTS=true'
    : 'TEST_DATABASE_URL nao configurada'
  : false
const queueSkip = skip || (!testRedisUrl ? 'TEST_REDIS_URL nao configurada' : false)

let adminPool: Pool
let connectionA: DatabaseConnection
let connectionB: DatabaseConnection
let connectionRls: DatabaseConnection
let testDatabaseUrl: string
let databaseName: string
let rlsRoleName: string

before(async () => {
  if (!baseUrl) {
    if (requireDatabase) throw new Error('TEST_DATABASE_URL e obrigatoria para os testes de banco.')
    return
  }

  const adminUrl = new URL(baseUrl)
  adminUrl.pathname = '/postgres'
  databaseName = `betintel_test_${Date.now()}_${process.pid}`
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 2 })
  await adminPool.query(`CREATE DATABASE "${databaseName}"`)

  const databaseUrl = new URL(baseUrl)
  databaseUrl.pathname = `/${databaseName}`
  testDatabaseUrl = databaseUrl.toString()
  connectionA = createDatabaseConnection(testDatabaseUrl)
  connectionB = createDatabaseConnection(testDatabaseUrl)

  await migrate(connectionA.db, {
    migrationsFolder: resolve('backend/migrations'),
    migrationsSchema: 'ops',
    migrationsTable: 'schema_migrations',
  })

  rlsRoleName = `betintel_app_${Date.now()}_${process.pid}`
  const rlsPassword = `test_${randomUUID()}`
  await adminPool.query(
    `create role ${quoteIdentifier(rlsRoleName)} login password '${rlsPassword}' nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  )
  await adminPool.query(
    `grant connect on database ${quoteIdentifier(databaseName)} to ${quoteIdentifier(rlsRoleName)}`,
  )
  await connectionA.pool.query(
    `grant usage on schema iam, billing, sports, model, ops to ${quoteIdentifier(rlsRoleName)};
     grant select, insert, update, delete on all tables in schema iam, billing, sports, model, ops to ${quoteIdentifier(rlsRoleName)};
     grant usage, select on all sequences in schema iam, billing, sports, model, ops to ${quoteIdentifier(rlsRoleName)}`,
  )
  const rlsUrl = new URL(testDatabaseUrl)
  rlsUrl.username = rlsRoleName
  rlsUrl.password = rlsPassword
  connectionRls = createDatabaseConnection(rlsUrl.toString())
})

after(async () => {
  if (!baseUrl) return
  await connectionA.close()
  await connectionB.close()
  await connectionRls.close()
  await adminPool.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`,
    [databaseName],
  )
  await adminPool.query(`DROP DATABASE "${databaseName}"`)
  await adminPool.query(`DROP ROLE ${quoteIdentifier(rlsRoleName)}`)
  await adminPool.end()
})

test('migrations reconstroem o banco do zero com todos os schemas', { skip }, async () => {
  const result = await connectionA.pool.query<{ count: string }>(
    `select count(*)::text as count
      from information_schema.tables
      where table_schema in ('iam', 'billing', 'legal', 'sports', 'model', 'ops')
        and table_name <> 'schema_migrations'`,
  )
  assert.equal(Number(result.rows[0].count), 31)
})

test('constraints preservam integridade referencial e deduplicam webhook', { skip }, async () => {
  const missingOrganization = randomUUID()
  const missingUser = randomUUID()

  await assert.rejects(
    connectionA.pool.query(
      `insert into iam.memberships (organization_id, user_id, role)
       values ($1, $2, 'viewer')`,
      [missingOrganization, missingUser],
    ),
    (error: unknown) => postgresCode(error) === '23503',
  )

  const event = {
    provider: 'stripe-test',
    providerEventId: `evt_${randomUUID()}`,
    eventType: 'invoice.paid',
    payloadSha256: 'a'.repeat(64),
  }
  await connectionA.db.insert(webhookEvents).values(event)
  await assert.rejects(
    connectionA.db.insert(webhookEvents).values(event),
    (error: unknown) => postgresCode(error) === '23505',
  )
})

test('dados esportivos nao recebem tenant e privados exigem organization_id', { skip }, async () => {
  const sportsTenantColumns = await connectionA.pool.query(
    `select table_name from information_schema.columns
      where table_schema = 'sports' and column_name in ('organization_id', 'tenant_id')`,
  )
  assert.equal(sportsTenantColumns.rows.length, 0)

  const privateColumns = await connectionA.pool.query<{
    table_schema: string
    table_name: string
    is_nullable: string
  }>(
    `select table_schema, table_name, is_nullable
       from information_schema.columns
      where column_name = 'organization_id'
        and (table_schema, table_name) in (
          ('iam', 'memberships'),
          ('iam', 'invitations'),
          ('iam', 'api_keys'),
          ('billing', 'subscriptions'),
          ('billing', 'usage_records'),
          ('billing', 'invoices'),
          ('legal', 'acceptances'),
          ('ops', 'saved_queries'),
          ('ops', 'alert_rules'),
          ('ops', 'support_tickets'),
          ('ops', 'incidents'),
          ('ops', 'exports')
        )`,
  )
  assert.equal(privateColumns.rows.length, 12)
  assert.ok(privateColumns.rows.every((row) => row.is_nullable === 'NO'))
})

test('RLS e FORCE RLS protegem cada tabela privada mesmo sem filtro da aplicacao', { skip }, async () => {
  const privateTables = [
    ['iam', 'organizations'],
    ['iam', 'memberships'],
    ['iam', 'invitations'],
    ['iam', 'api_keys'],
    ['iam', 'session_metadata'],
    ['billing', 'subscriptions'],
    ['billing', 'usage_records'],
    ['billing', 'invoices'],
    ['legal', 'acceptances'],
    ['model', 'predictions'],
    ['ops', 'saved_queries'],
    ['ops', 'alert_rules'],
    ['ops', 'support_tickets'],
    ['ops', 'incidents'],
    ['ops', 'exports'],
    ['ops', 'background_jobs'],
    ['ops', 'dead_letter_jobs'],
    ['ops', 'audit_log'],
  ] as const
  const catalog = await connectionA.pool.query<{
    schema_name: string
    table_name: string
    row_security: boolean
    force_row_security: boolean
  }>(
    `select n.nspname as schema_name, c.relname as table_name,
            c.relrowsecurity as row_security, c.relforcerowsecurity as force_row_security
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname, c.relname) in (${privateTables.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(',')})`,
    privateTables.flat(),
  )
  assert.equal(catalog.rows.length, privateTables.length)
  assert.ok(catalog.rows.every((row) => row.row_security && row.force_row_security))

  const organizationA = randomUUID()
  const organizationB = randomUUID()
  const userA = randomUUID()
  const userB = randomUUID()
  const fixture = await ensureRlsFixture()
  const dataset = await connectionA.db
    .insert(datasetVersions)
    .values({
      datasetKey: `rls-${randomUUID()}`,
      version: 1,
      contentSha256: randomHash(),
      status: 'ready',
    })
    .returning({ id: datasetVersions.id })
  const model = await connectionA.db
    .insert(modelVersions)
    .values({
      modelKey: `rls-${randomUUID()}`,
      version: 1,
      datasetVersionId: dataset[0].id,
      status: 'training',
      minRows: 1,
      trainingRows: 0,
      payload: {},
      payloadSha256: randomHash(),
      codeVersion: 'test',
      featureSetVersion: 'test-features',
      modelSchemaVersion: 'test-model',
      hyperparameters: { seed: 2026 },
      artifactFingerprint: randomHash(),
    })
    .returning({ id: modelVersions.id })
  const plan = await connectionA.db
    .insert(plans)
    .values({
      planKey: `rls-${randomUUID()}`,
      name: 'RLS test',
      priceMinor: 0,
      currency: 'BRL',
      interval: 'month',
      entitlements: {},
    })
    .returning({ id: plans.id })

  await connectionA.db.insert(organizations).values([
    { id: organizationA, slug: `rls-a-${randomUUID().slice(0, 8)}`, name: 'RLS A' },
    { id: organizationB, slug: `rls-b-${randomUUID().slice(0, 8)}`, name: 'RLS B' },
  ])
  await connectionA.db.insert(users).values([
    {
      id: userA,
      identityProvider: 'auth0',
      providerSubject: `rls-a-${randomUUID()}`,
      emailVerified: true,
    },
    {
      id: userB,
      identityProvider: 'auth0',
      providerSubject: `rls-b-${randomUUID()}`,
      email: 'rls-b@example.test',
      emailNormalized: 'rls-b@example.test',
      emailVerified: true,
    },
  ])
  await connectionA.db.insert(memberships).values([
    { organizationId: organizationA, userId: userA, role: 'owner' },
    { organizationId: organizationB, userId: userB, role: 'owner' },
  ])
  await connectionA.db.insert(invitations).values({
    organizationId: organizationB,
    emailNormalized: 'invite-b@example.test',
    role: 'viewer',
    tokenHash: randomHash(),
    invitedByUserId: userB,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  await connectionA.db.insert(apiKeys).values({
    organizationId: organizationB,
    createdByUserId: userB,
    name: 'RLS key',
    keyPrefix: `rls_${randomUUID()}`,
    secretHash: randomHash(),
  })
  await connectionA.db.insert(sessionMetadata).values({
    organizationId: organizationB,
    userId: userB,
    identityProvider: 'auth0',
    providerSessionId: `rls-${randomUUID()}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  const subscription = await connectionA.db
    .insert(subscriptions)
    .values({
      organizationId: organizationB,
      planId: plan[0].id,
      provider: 'test',
      providerCustomerId: `cus_${randomUUID()}`,
      providerSubscriptionId: `sub_${randomUUID()}`,
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .returning({ id: subscriptions.id })
  await connectionA.db.insert(usageRecords).values({
    organizationId: organizationB,
    subscriptionId: subscription[0].id,
    metric: 'rls-test',
    quantity: 1,
    periodStart: new Date().toISOString(),
    periodEnd: new Date(Date.now() + 3_600_000).toISOString(),
    idempotencyKey: randomUUID(),
  })
  await connectionA.db.insert(invoices).values({
    organizationId: organizationB,
    subscriptionId: subscription[0].id,
    provider: 'test',
    providerInvoiceId: `inv_${randomUUID()}`,
    status: 'open',
    currency: 'BRL',
    amountDueMinor: 0,
  })
  await connectionA.db.insert(predictions).values({
    scope: 'organization',
    organizationId: organizationB,
    fixtureId: fixture,
    modelVersionId: model[0].id,
    idempotencyKey: randomUUID(),
    status: 'pending',
  })
  await connectionA.db.insert(exportsTable).values({
    organizationId: organizationB,
    requestedByUserId: userB,
    type: 'rls-test',
  })
  const savedQuery = await connectionA.db
    .insert(savedQueries)
    .values({
      organizationId: organizationB,
      createdByUserId: userB,
      name: `RLS ${randomUUID()}`,
      filters: { league: 'all', period: 'all', market: 'all', query: '' },
    })
    .returning({ id: savedQueries.id })
  await connectionA.db.insert(alertRules).values({
    organizationId: organizationB,
    createdByUserId: userB,
    savedQueryId: savedQuery[0].id,
    name: `RLS ${randomUUID()}`,
  })
  await connectionA.db.insert(supportTickets).values({
    organizationId: organizationB, createdByUserId: userB, category: 'technical', severity: 'sev3',
    encryptedContent: 'Y2lwaGVydGV4dA==', contentIv: 'aXY=', contentAuthTag: 'dGFn',
    encryptionKeyVersion: 'test-v1', slaDueAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  await connectionA.db.insert(incidents).values({
    organizationId: organizationB, createdByUserId: userB, severity: 'sev2', ownerTeam: 'engineering',
    encryptedContent: 'Y2lwaGVydGV4dA==', contentIv: 'aXY=', contentAuthTag: 'dGFn', encryptionKeyVersion: 'test-v1',
  })
  const rlsJob = await connectionA.db
    .insert(backgroundJobs)
    .values({
      scope: 'organization',
      organizationId: organizationB,
      queue: 'rls-test',
      jobType: 'rls-test',
      idempotencyKey: randomUUID(),
      requestedByUserId: userB,
    })
    .returning({ id: backgroundJobs.id })
  await connectionA.db.insert(deadLetterJobs).values({
    backgroundJobId: rlsJob[0].id,
    scope: 'organization',
    organizationId: organizationB,
    requestedByUserId: userB,
    queue: 'rls-test',
    jobType: 'rls-test',
    attempts: 1,
    failureCode: 'rls-test',
  })
  await connectionA.db.insert(auditLog).values({
    scope: 'organization',
    organizationId: organizationB,
    actorUserId: userB,
    action: 'rls.test',
    targetType: 'rls-test',
  })

  const client = await connectionRls.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('app.user_id', $1, true)`, [userA])
    await client.query(`select set_config('app.user_email', $1, true)`, ['rls-a@example.test'])
    await client.query(`select set_config('app.organization_id', $1, true)`, [organizationA])
    const probes = [
      ['iam.organizations', 'id'],
      ['iam.memberships', 'organization_id'],
      ['iam.invitations', 'organization_id'],
      ['iam.api_keys', 'organization_id'],
      ['iam.session_metadata', 'organization_id'],
      ['billing.subscriptions', 'organization_id'],
      ['billing.usage_records', 'organization_id'],
      ['billing.invoices', 'organization_id'],
      ['legal.acceptances', 'organization_id'],
      ['model.predictions', 'organization_id'],
      ['ops.saved_queries', 'organization_id'],
      ['ops.alert_rules', 'organization_id'],
      ['ops.support_tickets', 'organization_id'],
      ['ops.incidents', 'organization_id'],
      ['ops.exports', 'organization_id'],
      ['ops.background_jobs', 'organization_id'],
      ['ops.dead_letter_jobs', 'organization_id'],
      ['ops.audit_log', 'organization_id'],
    ] as const
    for (const [table, column] of probes) {
      const hidden = await client.query<{ visible: boolean }>(
        `select exists(select 1 from ${table} where ${column} = $1) as visible`,
        [organizationB],
      )
      assert.equal(hidden.rows[0].visible, false, `${table} vazou tenant B`)
    }

    await client.query('savepoint cross_tenant_write')
    await assert.rejects(
      client.query(
        `insert into ops.exports (organization_id, requested_by_user_id, type)
         values ($1, $2, 'cross-tenant')`,
        [organizationB, userA],
      ),
      (error: unknown) => postgresCode(error) === '42501',
    )
    await client.query('rollback to savepoint cross_tenant_write')

    const sportsVisible = await client.query<{ count: string }>(
      `select count(*)::text as count from sports.fixtures where id = $1`,
      [fixture],
    )
    assert.equal(sportsVisible.rows[0].count, '1')
    await client.query('rollback')
  } finally {
    client.release()
  }
})

test('transacao composta faz rollback integral', { skip }, async () => {
  const slug = `rollback-${Date.now()}`

  await assert.rejects(
    connectionA.db.transaction(async (tx) => {
      await tx.insert(organizations).values({ slug, name: 'Rollback test' })
      throw new Error('falha intencional')
    }),
    /falha intencional/,
  )

  const rows = await connectionA.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
  assert.equal(rows.length, 0)
})

test('audit_log e append-only no banco', { skip }, async () => {
  const inserted = await connectionA.pool.query<{ id: string }>(
    `insert into ops.audit_log (scope, action, target_type)
     values ('system', 'test.created', 'integration-test') returning id::text`,
  )

  await assert.rejects(
    connectionA.pool.query(`update ops.audit_log set action = 'changed' where id = $1`, [
      inserted.rows[0].id,
    ]),
    (error: unknown) => postgresCode(error) === '55000',
  )
})

test('concorrencia importa uma unica versao e uma unica fixture', { skip }, async () => {
  const repositoriesA = createPostgresRepositories(connectionA)
  const repositoriesB = createPostgresRepositories(connectionB)
  const batch = sportsBatch(`concurrency-${randomUUID()}`, 'shared-external-id')

  const results = await Promise.all([
    repositoriesA.sports.importBatch(batch),
    repositoriesB.sports.importBatch(batch),
  ])

  assert.equal(results.filter((result) => result.alreadyImported).length, 1)
  assert.equal(results.reduce((total, result) => total + result.inserted, 0), 1)

  const repeated = await repositoriesA.sports.importBatch(batch)
  assert.equal(repeated.alreadyImported, true)
  assert.equal(repeated.inserted, 0)

  const fixtureCount = await connectionA.pool.query<{ count: string }>(
    `select count(*)::text as count from sports.fixtures
      where source_provider = $1 and external_id = $2`,
    [batch.records[0].sourceProvider, batch.records[0].externalId],
  )
  assert.equal(Number(fixtureCount.rows[0].count), 1)
})

test('importador dry-run nao grava e a aplicacao real e idempotente', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'betintel-import-'))
  const dataDirectory = resolve(temporaryDirectory, 'data')
  const artifactsDirectory = resolve(temporaryDirectory, 'artifacts')
  await connectionA.pool.query(`select 1`)

  try {
    await Promise.all([mkdir(dataDirectory), mkdir(artifactsDirectory)])
    await writeFile(
      resolve(dataDirectory, 'combined-results.csv'),
      [
        'League,Competition,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,SourceProvider',
        'Test League,Test Competition,2026,15/07/2026,Alpha,Beta,2,1,H,dry-run-provider',
      ].join('\n'),
      'utf8',
    )

    const beforeCount = await connectionA.pool.query<{ count: string }>(
      `select count(*)::text as count from model.dataset_versions`,
    )
    const report = await importLocalState(repositories, {
      dataDirectory,
      artifactsDirectory,
      dryRun: true,
    })
    const afterCount = await connectionA.pool.query<{ count: string }>(
      `select count(*)::text as count from model.dataset_versions`,
    )

    assert.equal(report.accepted, 1)
    assert.equal(report.inserted, 0)
    assert.equal(afterCount.rows[0].count, beforeCount.rows[0].count)

    const firstImport = await importLocalState(repositories, {
      dataDirectory,
      artifactsDirectory,
    })
    const repeatedImport = await importLocalState(repositories, {
      dataDirectory,
      artifactsDirectory,
    })

    assert.equal(firstImport.inserted, 1)
    assert.equal(firstImport.alreadyImported, false)
    assert.equal(repeatedImport.inserted, 0)
    assert.equal(repeatedImport.alreadyImported, true)
    assert.equal(repeatedImport.datasetVersionId, firstImport.datasetVersionId)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

test('deduplicacao considera fonte e identificador externo', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const externalId = `same-id-${randomUUID()}`
  const first = sportsBatch(`source-a-${randomUUID()}`, externalId)
  const second = sportsBatch(`source-b-${randomUUID()}`, externalId)

  await repositories.sports.importBatch(first)
  await repositories.sports.importBatch(second)

  const result = await connectionA.pool.query<{ count: string }>(
    `select count(*)::text as count from sports.fixtures where external_id = $1`,
    [externalId],
  )
  assert.equal(Number(result.rows[0].count), 2)
})

test('duas instancias HTTP compartilham o mesmo estado PostgreSQL', { skip }, async () => {
  const repositoriesA = createPostgresRepositories(connectionA)
  const repositoriesB = createPostgresRepositories(connectionB)
  const provider = new TestIdentityProvider()
  const token = provider.token(`two-instances-${randomUUID()}`, 'shared-session')
  const serverA = authenticatedServer(connectionA, repositoriesA, provider)
  const serverB = authenticatedServer(connectionB, repositoriesB, provider)

  await Promise.all([listen(serverA), listen(serverB)])
  try {
    const [healthA, healthB, competitionsA, competitionsB] = await Promise.all([
      fetch(`${serverUrl(serverA)}/v1/health/ready`).then((response) => response.json()),
      fetch(`${serverUrl(serverB)}/v1/health/ready`).then((response) => response.json()),
      fetch(`${serverUrl(serverA)}/v1/competitions`, authorization(token)).then((response) => response.json()),
      fetch(`${serverUrl(serverB)}/v1/competitions`, authorization(token)).then((response) => response.json()),
    ])

    assert.equal((healthA as { storage: string }).storage, 'postgresql')
    assert.equal((healthB as { storage: string }).storage, 'postgresql')
    assert.deepEqual(competitionsA, competitionsB)
  } finally {
    await Promise.all([close(serverA), close(serverB)])
  }
})

test('rate limit Redis e compartilhado entre replicas HTTP', { skip: queueSkip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  const token = provider.token(`rate-limit-${randomUUID()}`, `session-${randomUUID()}`)
  const namespace = `betintel-test-rate-${randomUUID()}:`
  const serverA = authenticatedServer(connectionA, repositories, provider, {
    rateLimitMax: 1,
    rateLimitRedis: new Redis(testRedisUrl!, { maxRetriesPerRequest: 1 }),
    redisNamespace: namespace,
  })
  const serverB = authenticatedServer(connectionB, createPostgresRepositories(connectionB), provider, {
    rateLimitMax: 1,
    rateLimitRedis: new Redis(testRedisUrl!, { maxRetriesPerRequest: 1 }),
    redisNamespace: namespace,
  })
  await Promise.all([listen(serverA), listen(serverB)])
  try {
    assert.equal((await fetch(`${serverUrl(serverA)}/v1/me`, authorization(token))).status, 200)
    assert.equal((await fetch(`${serverUrl(serverB)}/v1/me`, authorization(token))).status, 429)
  } finally {
    await Promise.all([close(serverA), close(serverB)])
  }
})

test('rotas privadas exigem token e provisionamento local e idempotente', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  const subject = `idempotent-${randomUUID()}`
  const token = provider.token(subject, `session-${randomUUID()}`)
  const server = authenticatedServer(connectionA, repositories, provider)
  await listen(server)

  try {
    const missing = await fetch(`${serverUrl(server)}/v1/me`)
    assert.equal(missing.status, 401)

    const first = await fetch(`${serverUrl(server)}/v1/me`, authorization(token))
    const second = await fetch(
      `${serverUrl(server)}/v1/me?organization_id=${randomUUID()}&tenant_id=${randomUUID()}`,
      authorization(token),
    )
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    const firstBody = (await first.json()) as { userId: string; organizationId: string }
    const secondBody = (await second.json()) as { userId: string; organizationId: string }
    assert.deepEqual(secondBody, firstBody)

    const counts = await connectionA.pool.query<{ users: string; memberships: string }>(
      `select
         (select count(*) from iam.users where provider_subject = $1)::text as users,
         (select count(*) from iam.memberships where user_id = $2)::text as memberships`,
      [subject, firstBody.userId],
    )
    assert.equal(counts.rows[0].users, '1')
    assert.equal(counts.rows[0].memberships, '1')

    const blockedOrigin = await fetch(`${serverUrl(server)}/v1/me`, {
      ...authorization(token),
      headers: { authorization: `Bearer ${token}`, origin: 'https://attacker.invalid' },
    })
    assert.equal(blockedOrigin.status, 403)
  } finally {
    await close(server)
  }
})

test('jobs administrativos sao duraveis, idempotentes e isolados por RLS', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionRls)
  const provider = new TestIdentityProvider()
  const ownerToken = provider.token(`job-owner-${randomUUID()}`, `session-${randomUUID()}`)
  const otherOwnerToken = provider.token(`job-other-${randomUUID()}`, `session-${randomUUID()}`)
  const server = authenticatedServer(connectionRls, repositories, provider)
  await listen(server)

  try {
    await Promise.all([
      fetch(`${serverUrl(server)}/v1/me`, authorization(ownerToken)),
      fetch(`${serverUrl(server)}/v1/me`, authorization(otherOwnerToken)),
    ])
    const idempotencyKey = `training-${randomUUID()}`
    const enqueue = () => fetch(`${serverUrl(server)}/v1/admin/jobs/model-training`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': idempotencyKey,
      },
    })
    const first = await enqueue()
    const second = await enqueue()
    assert.equal(first.status, 202)
    assert.equal(second.status, 202)
    const firstJob = (await first.json()) as { id: string; type: string; status: string }
    const secondJob = (await second.json()) as { id: string }
    assert.deepEqual(secondJob.id, firstJob.id)
    assert.equal(firstJob.type, 'model-training')
    assert.equal(firstJob.status, 'queued')

    const stored = await connectionA.pool.query<{ count: string; scope: string }>(
      `select count(*)::text as count, min(scope)::text as scope
         from ops.background_jobs
        where id = $1`,
      [firstJob.id],
    )
    assert.equal(stored.rows[0].count, '1')
    assert.equal(stored.rows[0].scope, 'system')

    const ownRead = await fetch(
      `${serverUrl(server)}/v1/admin/jobs/${firstJob.id}`,
      authorization(ownerToken),
    )
    const otherRead = await fetch(
      `${serverUrl(server)}/v1/admin/jobs/${firstJob.id}`,
      authorization(otherOwnerToken),
    )
    assert.equal(ownRead.status, 200)
    assert.equal(otherRead.status, 404)
    const cancel = await fetch(`${serverUrl(server)}/v1/admin/jobs/${firstJob.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    assert.equal(cancel.status, 202)
    const cancelled = await fetch(
      `${serverUrl(server)}/v1/admin/jobs/${firstJob.id}`,
      authorization(ownerToken),
    )
    assert.equal((await cancelled.json() as { status: string }).status, 'cancelled')
  } finally {
    await close(server)
  }
})

test('outbox e BullMQ deduplicam publicacao repetida apos reinicio', { skip: queueSkip }, async () => {
  const repositories = createPostgresRepositories(connectionRls)
  const prefix = `betintel-test-${randomUUID()}`
  const queues = new BullMqQueues(testRedisUrl!, prefix)
  const dispatcher = new OutboxDispatcher(repositories.jobs, queues, silentJobLogger, 50)
  try {
    const first = await repositories.jobs.enqueueScheduledSystemJob(
      SystemJobTypes.SPORTS_SYNC,
      `restart-${randomUUID()}`,
    )
    const duplicate = await repositories.jobs.enqueueScheduledSystemJob(
      SystemJobTypes.SPORTS_SYNC,
      `restart-${first.id}`,
    )
    const repeated = await repositories.jobs.enqueueScheduledSystemJob(
      SystemJobTypes.SPORTS_SYNC,
      `restart-${first.id}`,
    )
    assert.equal(duplicate.id, repeated.id)

    await dispatcher.pollOnce(100)
    await connectionA.pool.query(
      `update ops.background_jobs set dispatched_at = null where id = $1`,
      [duplicate.id],
    )
    await dispatcher.pollOnce(100)

    const bullJob = await queues.get(QueueNames.INGESTION).getJob(duplicate.id)
    assert.ok(bullJob)
    const attempts = await connectionA.pool.query<{ dispatch_attempts: number }>(
      `select dispatch_attempts from ops.background_jobs where id = $1`,
      [duplicate.id],
    )
    assert.equal(attempts.rows[0].dispatch_attempts, 2)
    assert.notEqual(first.id, duplicate.id)
  } finally {
    dispatcher.stop()
    await queues.close()
  }
})

test('retry exponencial esgotado registra DLQ sem payload sensivel', { skip: queueSkip }, async () => {
  const repositories = createPostgresRepositories(connectionRls)
  const prefix = `betintel-test-${randomUUID()}`
  const queues = new BullMqQueues(testRedisUrl!, prefix)
  const dispatcher = new OutboxDispatcher(repositories.jobs, queues, silentJobLogger, 25)
  const processors = new Map([
    [SystemJobTypes.EVALUATION, async () => {
      throw new ExternalProviderError('test-provider', 503)
    }],
  ])
  const workers = new BullMqWorkers(
    testRedisUrl!,
    prefix,
    [QueueNames.EVALUATION],
    processors,
    repositories.jobs,
    silentJobLogger,
  )
  try {
    const job = await repositories.jobs.enqueueScheduledSystemJob(
      SystemJobTypes.EVALUATION,
      `dlq-${randomUUID()}`,
    )
    await dispatcher.pollOnce(100)
    await waitFor(async () => {
      const result = await connectionA.pool.query<{ count: string }>(
        `select count(*)::text as count from ops.dead_letter_jobs where background_job_id = $1`,
        [job.id],
      )
      return result.rows[0].count === '1'
    }, 15_000)
    const failed = await connectionA.pool.query<{
      status: string
      attempts: number
      failure_code: string
      payload_present: boolean
    }>(
      `select j.status, j.attempts, d.failure_code,
              exists(
                select 1 from information_schema.columns
                where table_schema = 'ops' and table_name = 'dead_letter_jobs'
                  and column_name = 'payload'
              ) as payload_present
         from ops.background_jobs j
         join ops.dead_letter_jobs d on d.background_job_id = j.id
        where j.id = $1`,
      [job.id],
    )
    assert.equal(failed.rows[0].status, 'failed')
    assert.equal(failed.rows[0].attempts, 3)
    assert.equal(failed.rows[0].failure_code, 'provider_unavailable')
    assert.equal(failed.rows[0].payload_present, false)
  } finally {
    dispatcher.stop()
    await workers.close()
    await queues.close()
  }
})

test('circuit breaker abre apos falhas externas sem criar fallback', { skip: queueSkip }, async () => {
  const redis = new Redis(testRedisUrl!, { maxRetriesPerRequest: 1 })
  const provider = `provider-${randomUUID()}`
  const quota = new PostgresProviderQuota(connectionA.db)
  const guard = new ExternalRequestGuard(
    quota,
    new RedisCircuitBreaker(redis, `betintel-test-${randomUUID()}`, 2, 60_000),
    silentJobLogger,
  )
  let calls = 0
  const execute = () => guard.execute({
    provider,
    limits: { daily: 100, monthly: 1_000, alertPercentage: 80 },
    minimumGapMs: 0,
    operation: async () => {
      calls += 1
      throw new ExternalProviderError(provider, 503)
    },
  })
  try {
    await assert.rejects(execute, ExternalProviderError)
    await assert.rejects(execute, ExternalProviderError)
    await assert.rejects(execute, (error: unknown) =>
      error instanceof Error && error.name === 'CircuitOpenError',
    )
    assert.equal(calls, 2)
  } finally {
    await redis.quit()
  }
})

test('cota diaria e mensal e atomica e alerta antes do estouro', { skip }, async () => {
  const quota = new PostgresProviderQuota(connectionA.db)
  const provider = `quota-${randomUUID()}`
  const limits = { daily: 2, monthly: 2, alertPercentage: 50 }
  const first = await quota.reserve(provider, limits, new Date('2026-07-15T12:00:00Z'))
  const second = await quota.reserve(provider, limits, new Date('2026-07-15T13:00:00Z'))
  assert.equal(first.alerts.length, 2)
  assert.equal(second.alerts.length, 0)
  await assert.rejects(
    quota.reserve(provider, limits, new Date('2026-07-15T14:00:00Z')),
    (error: unknown) => error instanceof Error && error.name === 'QuotaExceededError',
  )
  const rows = await connectionA.db
    .select({ count: providerApiUsage.requestCount })
    .from(providerApiUsage)
    .where(eq(providerApiUsage.provider, provider))
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.count === 2))
})

test('lock PostgreSQL impede treino concorrente do mesmo dataset', { skip }, async () => {
  const lock = new PostgresTrainingLock(connectionA.pool)
  const datasetVersionId = randomUUID()
  let release!: () => void
  let started!: () => void
  const hasStarted = new Promise<void>((resolve) => { started = resolve })
  const hold = new Promise<void>((resolve) => { release = resolve })
  const first = lock.runExclusive(datasetVersionId, async () => {
    started()
    await hold
  })
  await hasStarted
  await assert.rejects(
    lock.runExclusive(datasetVersionId, async () => undefined),
    TrainingAlreadyRunningError,
  )
  release()
  await first
})

test('correcao de resultado e detectada para disparar reprocessamento', { skip }, async () => {
  const repository = createPostgresRepositories(connectionA).sports
  const provider = `correction-${randomUUID()}`
  const first = sportsBatch(provider, randomUUID())
  first.contentSha256 = randomHash()
  first.records[0].status = 'finished'
  first.records[0].result = { homeGoals: 1, awayGoals: 0, outcome: 'H', decision: 'regulation', winner: 'home' }
  const second = structuredClone(first)
  second.contentSha256 = randomHash()
  second.records[0].result = { homeGoals: 1, awayGoals: 1, outcome: 'D', decision: 'regulation', winner: 'draw' }
  const firstImport = await repository.importBatch(first)
  const secondImport = await repository.importBatch(second)
  assert.equal(firstImport.correctedResults, 0)
  assert.equal(secondImport.correctedResults, 1)
  assert.equal((await repository.readTrainingRows(firstImport.datasetVersionId!))[0].FTAG, '0')
  assert.equal((await repository.readTrainingRows(secondImport.datasetVersionId!))[0].FTAG, '1')
})

test('reinicio apos efeito de treino reutiliza a mesma model_version', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionRls)
  const datasetVersionId = await repositories.jobs.latestReadyDatasetVersionId()
  assert.ok(datasetVersionId)
  const features = buildFeatureTable(await repositories.sports.readTrainingRows())
  const modelValue = trainModel(features.records, { minRows: 1 })
  const job = await repositories.jobs.enqueueScheduledSystemJob(
    SystemJobTypes.MODEL_TRAINING,
    `model-restart-${randomUUID()}`,
  )
  const first = await repositories.models.saveModel(modelValue, datasetVersionId, job.id)
  const restarted = await repositories.models.saveModel(modelValue, datasetVersionId, job.id)
  assert.deepEqual(restarted, first)
  const count = await connectionA.pool.query<{ count: string }>(
    `select count(*)::text as count from model.model_versions where source_job_id = $1`,
    [job.id],
  )
  assert.equal(count.rows[0].count, '1')
})

test('champion challenger promove somente por decisao e rollback restaura versao aposentada', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const datasetVersionId = await repositories.jobs.latestReadyDatasetVersionId()
  assert.ok(datasetVersionId)
  const features = buildFeatureTable(await repositories.sports.readTrainingRows(datasetVersionId))
  const first = await repositories.models.saveModel(
    trainModel(features.records, { minRows: 1, codeVersion: 'promotion-test-a' }),
    datasetVersionId,
  )
  assert.notEqual((await repositories.models.getActiveModel())?.modelVersionId, first.id)
  await repositories.models.applyPromotionDecision(first.id, {
    decision: 'promote', reasons: ['teste'], evaluatedMarkets: 1, candidateMeanBrier: 0.2,
  })
  assert.equal((await repositories.models.getActiveModel())?.modelVersionId, first.id)

  const second = await repositories.models.saveModel(
    trainModel(features.records, { minRows: 1, codeVersion: 'promotion-test-b' }),
    datasetVersionId,
  )
  await repositories.models.applyPromotionDecision(second.id, {
    decision: 'promote', reasons: ['challenger aprovado'], evaluatedMarkets: 1,
    candidateMeanBrier: 0.19, championMeanBrier: 0.2,
  })
  assert.equal((await repositories.models.getActiveModel())?.modelVersionId, second.id)
  assert.equal(await repositories.models.rollbackModel(first.id, 'rollback de teste controlado'), true)
  assert.equal((await repositories.models.getActiveModel())?.modelVersionId, first.id)
})

test('organizacoes, convites, RBAC e troca de tenant usam somente a sessao validada', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionRls)
  const provider = new TestIdentityProvider()
  const ownerSubject = `org-owner-${randomUUID()}`
  const memberSubject = `org-member-${randomUUID()}`
  const ownerToken = provider.token(ownerSubject, `session-${randomUUID()}`)
  const memberToken = provider.token(memberSubject, `session-${randomUUID()}`)
  const server = authenticatedServer(connectionRls, repositories, provider)
  await listen(server)

  try {
    const ownerPersonal = await responseActor(server, ownerToken)
    const memberPersonal = await responseActor(server, memberToken)
    const createdResponse = await fetch(`${serverUrl(server)}/v1/organizations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Editorial Test', slug: `editorial-${randomUUID().slice(0, 8)}` }),
    })
    assert.equal(createdResponse.status, 201)
    const created = (await createdResponse.json()) as { id: string; role: string }
    assert.equal(created.role, 'owner')

    const organizationsResponse = await fetch(
      `${serverUrl(server)}/v1/organizations?tenant_id=${memberPersonal.organizationId}`,
      {
        headers: {
          authorization: `Bearer ${ownerToken}`,
          'x-tenant-id': memberPersonal.organizationId,
          'x-organization-id': memberPersonal.organizationId,
        },
      },
    )
    const organizationPayload = (await organizationsResponse.json()) as {
      organizations: Array<{ id: string; active: boolean }>
    }
    assert.equal(organizationPayload.organizations.length, 2)
    assert.equal(organizationPayload.organizations.find((item) => item.active)?.id, created.id)

    const forbiddenSwitch = await fetch(`${serverUrl(server)}/v1/organizations/switch`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: memberPersonal.organizationId }),
    })
    assert.equal(forbiddenSwitch.status, 404)

    const switchPersonal = await fetch(`${serverUrl(server)}/v1/organizations/switch`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: ownerPersonal.organizationId }),
    })
    assert.equal(switchPersonal.status, 200)
    assert.equal((await responseActor(server, ownerToken)).organizationId, ownerPersonal.organizationId)
    const switchCreated = await fetch(`${serverUrl(server)}/v1/organizations/switch`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: created.id }),
    })
    assert.equal(switchCreated.status, 200)

    const tamperedMembers = await fetch(
      `${serverUrl(server)}/v1/organization/members?organization_id=${memberPersonal.organizationId}`,
      {
        headers: {
          authorization: `Bearer ${ownerToken}`,
          'x-tenant-id': memberPersonal.organizationId,
        },
      },
    )
    assert.equal(tamperedMembers.status, 200)
    const memberList = (await tamperedMembers.json()) as { members: Array<{ userId: string }> }
    assert.deepEqual(memberList.members.map((item) => item.userId), [ownerPersonal.userId])
    assert.equal(
      (
        await fetch(
          `${serverUrl(server)}/v1/organizations/${memberPersonal.organizationId}/members`,
          authorization(ownerToken),
        )
      ).status,
      404,
    )

    const memberEmail = (await provider.getUser(memberSubject)).email
    const invitationResponse = await fetch(`${serverUrl(server)}/v1/organization/invitations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: memberEmail,
        role: 'member',
        expiresInHours: 24,
        organizationId: memberPersonal.organizationId,
        tenantId: memberPersonal.organizationId,
      }),
    })
    assert.equal(invitationResponse.status, 201)
    const invitation = (await invitationResponse.json()) as { id: string; token: string }
    const storedInvitation = await connectionA.db
      .select({ organizationId: invitations.organizationId })
      .from(invitations)
      .where(eq(invitations.id, invitation.id))
    assert.equal(storedInvitation[0].organizationId, created.id)

    const acceptResponse = await fetch(`${serverUrl(server)}/v1/invitations/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: invitation.token }),
    })
    assert.equal(acceptResponse.status, 200)
    const memberActor = await responseActor(server, memberToken)
    assert.equal(memberActor.organizationId, created.id)
    assert.equal(memberActor.role, 'member')
    assert.equal(
      (
        await fetch(`${serverUrl(server)}/v1/invitations/accept`, {
          method: 'POST',
          headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ token: invitation.token }),
        })
      ).status,
      400,
    )

    const expiredSubject = `expired-member-${randomUUID()}`
    const expiredToken = provider.token(expiredSubject, `session-${randomUUID()}`)
    await responseActor(server, expiredToken)
    const expiredInviteResponse = await fetch(
      `${serverUrl(server)}/v1/organization/invitations`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          email: (await provider.getUser(expiredSubject)).email,
          role: 'viewer',
          expiresInHours: 1,
        }),
      },
    )
    assert.equal(expiredInviteResponse.status, 201)
    const expiredInvite = (await expiredInviteResponse.json()) as { id: string; token: string }
    await connectionA.db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
      .where(eq(invitations.id, expiredInvite.id))
    const expiredAcceptance = await fetch(`${serverUrl(server)}/v1/invitations/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${expiredToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: expiredInvite.token }),
    })
    assert.equal(expiredAcceptance.status, 400)
    assert.equal(
      (
        await fetch(
          `${serverUrl(server)}/v1/organization/invitations/${expiredInvite.id}`,
          { ...authorization(ownerToken), method: 'DELETE' },
        )
      ).status,
      204,
    )

    const roleChange = await fetch(
      `${serverUrl(server)}/v1/organization/members/${memberActor.userId}`,
      {
        method: 'PATCH',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      },
    )
    assert.equal(roleChange.status, 204)
    assert.equal((await responseActor(server, memberToken)).role, 'viewer')
    assert.equal(
      (
        await fetch(`${serverUrl(server)}/v1/organization/invitations`, {
          method: 'POST',
          headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'denied@example.test', role: 'member' }),
        })
      ).status,
      403,
    )

    const transfer = await fetch(`${serverUrl(server)}/v1/organization/transfer-ownership`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ memberUserId: memberActor.userId }),
    })
    assert.equal(transfer.status, 204)
    assert.equal((await responseActor(server, ownerToken)).role, 'admin')
    assert.equal((await responseActor(server, memberToken)).role, 'owner')

    const keyId = randomUUID()
    await connectionA.db.insert(apiKeys).values({
      id: keyId,
      organizationId: created.id,
      createdByUserId: ownerPersonal.userId,
      name: 'Removed member key',
      keyPrefix: `removed_${randomUUID()}`,
      secretHash: randomHash(),
    })
    const removal = await fetch(
      `${serverUrl(server)}/v1/organization/members/${ownerPersonal.userId}`,
      { ...authorization(memberToken), method: 'DELETE' },
    )
    assert.equal(removal.status, 204)
    assert.equal((await fetch(`${serverUrl(server)}/v1/me`, authorization(ownerToken))).status, 401)
    const revokedKey = await connectionA.db
      .select({ status: apiKeys.status, revokedAt: apiKeys.revokedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
    assert.equal(revokedKey[0].status, 'revoked')
    assert.ok(revokedKey[0].revokedAt)

    const auditRows = await connectionA.db
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.organizationId, created.id))
    const auditedActions = new Set(auditRows.map((row) => row.action))
    for (const action of [
      'organization.created',
      'invitation.created',
      'invitation.accepted',
      'membership.role_changed',
      'organization.ownership_transferred',
      'membership.removed',
    ]) {
      assert.ok(auditedActions.has(action), `auditoria ausente: ${action}`)
    }
    assert.ok(
      auditRows
        .filter((row) => auditedActions.has(row.action))
        .every((row) => 'before' in row.metadata && 'after' in row.metadata),
    )
  } finally {
    await close(server)
  }
})

test('usuario desativado ou sem membership perde acesso imediatamente', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  const server = authenticatedServer(connectionA, repositories, provider)
  await listen(server)

  try {
    const disabledToken = provider.token(`disabled-${randomUUID()}`, `session-${randomUUID()}`)
    const disabledActor = await responseActor(server, disabledToken)
    await connectionA.db
      .update(users)
      .set({ status: 'disabled', disabledAt: new Date().toISOString() })
      .where(eq(users.id, disabledActor.userId))
    assert.equal(
      (await fetch(`${serverUrl(server)}/v1/me`, authorization(disabledToken))).status,
      403,
    )

    const removedToken = provider.token(`removed-${randomUUID()}`, `session-${randomUUID()}`)
    const removedActor = await responseActor(server, removedToken)
    await connectionA.db
      .update(memberships)
      .set({ status: 'revoked' })
      .where(eq(memberships.userId, removedActor.userId))
    assert.equal(
      (await fetch(`${serverUrl(server)}/v1/me`, authorization(removedToken))).status,
      403,
    )

    const unverifiedSubject = `unverified-${randomUUID()}`
    const unverifiedToken = provider.token(unverifiedSubject, `session-${randomUUID()}`)
    provider.profiles.set(unverifiedSubject, {
      ...(await provider.getUser(unverifiedSubject)),
      emailVerified: false,
    })
    assert.equal(
      (await fetch(`${serverUrl(server)}/v1/me`, authorization(unverifiedToken))).status,
      403,
    )
  } finally {
    await close(server)
  }
})

test('exportacao do titular e exclusao cobrem dados ativos e revogam acesso', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  const server = authenticatedServer(connectionA, repositories, provider)
  await listen(server)

  try {
    const subject = `privacy-${randomUUID()}`
    const sessionId = `session-${randomUUID()}`
    const token = provider.token(subject, sessionId)
    const actor = await responseActor(server, token)
    const actorContext: ActorContext = {
      ...actor, provider: 'auth0', subject, sessionId,
      tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      authenticatedAt: new Date().toISOString(),
    }
    await repositories.workspace.createSavedQuery(actorContext, 'Exportacao LGPD', {
      league: 'todas', period: 'todos', market: '1X2', query: 'privada',
    })
    const ticket = await fetch(`${serverUrl(server)}/v1/support/tickets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'privacy', severity: 'sev3', subject: 'Correcao de cadastro',
        description: 'Dado pessoal criado somente para o teste de exportacao.',
      }),
    })
    assert.equal(ticket.status, 201, await ticket.text())

    const exported = await fetch(`${serverUrl(server)}/v1/privacy/export`, authorization(token))
    assert.equal(exported.status, 200)
    assert.match(exported.headers.get('cache-control') ?? '', /no-store/)
    const payload = await exported.json() as {
      subject: { id: string }
      organizations: unknown[]
      savedQueries: Array<{ name: string }>
      supportTickets: Array<{ subject: string }>
      sessions: unknown[]
      auditTrail: unknown[]
    }
    assert.equal(payload.subject.id, actor.userId)
    assert.ok(payload.organizations.length >= 1)
    assert.equal(payload.savedQueries.some((row) => row.name === 'Exportacao LGPD'), true)
    assert.equal(payload.supportTickets.some((row) => row.subject === 'Correcao de cadastro'), true)
    assert.ok(payload.sessions.length >= 1)
    assert.ok(payload.auditTrail.length >= 1)

    const deleted = await fetch(`${serverUrl(server)}/v1/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(deleted.status, 204, await deleted.text())
    assert.equal((await fetch(`${serverUrl(server)}/v1/me`, authorization(token))).status, 401)
    const personal = await connectionA.db.select({
      email: users.email, displayName: users.displayName, providerSubject: users.providerSubject,
    }).from(users).where(eq(users.id, actor.userId))
    assert.equal(personal[0].email, null)
    assert.equal(personal[0].displayName, null)
    assert.match(personal[0].providerSubject, /^deleted\|[a-f0-9]{64}$/)
    const remainingTickets = await connectionA.db.select({ id: supportTickets.id })
      .from(supportTickets).where(eq(supportTickets.createdByUserId, actor.userId))
    assert.equal(remainingTickets.length, 0)
  } finally {
    await close(server)
  }
})

test('sessao de outro tenant nao pode ser revogada e sessao propria e bloqueada', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  const server = authenticatedServer(connectionA, repositories, provider)
  await listen(server)

  try {
    const sessionA = `session-a-${randomUUID()}`
    const sessionB = `session-b-${randomUUID()}`
    const tokenA = provider.token(`tenant-a-${randomUUID()}`, sessionA)
    const tokenB = provider.token(`tenant-b-${randomUUID()}`, sessionB)
    await responseActor(server, tokenA)
    await responseActor(server, tokenB)

    const crossTenant = await fetch(
      `${serverUrl(server)}/v1/account/sessions/${encodeURIComponent(sessionB)}`,
      { ...authorization(tokenA), method: 'DELETE' },
    )
    assert.equal(crossTenant.status, 404)

    const own = await fetch(
      `${serverUrl(server)}/v1/account/sessions/${encodeURIComponent(sessionA)}`,
      { ...authorization(tokenA), method: 'DELETE' },
    )
    assert.equal(own.status, 204)
    assert.equal((await fetch(`${serverUrl(server)}/v1/me`, authorization(tokenA))).status, 401)
  } finally {
    await close(server)
  }
})

test('exclusao de proprietario exige transferencia valida', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  const server = authenticatedServer(connectionA, repositories, provider)
  await listen(server)

  try {
    const ownerToken = provider.token(`owner-${randomUUID()}`, `session-${randomUUID()}`)
    const memberToken = provider.token(`member-${randomUUID()}`, `session-${randomUUID()}`)
    const owner = await responseActor(server, ownerToken)
    const member = await responseActor(server, memberToken)
    await connectionA.db.insert(memberships).values({
      organizationId: owner.organizationId,
      userId: member.userId,
      role: 'admin',
    })

    const withoutTransfer = await fetch(`${serverUrl(server)}/v1/account`, {
      ...authorization(ownerToken),
      method: 'DELETE',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(withoutTransfer.status, 409)

    const withTransfer = await fetch(`${serverUrl(server)}/v1/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ replacementOwnerUserId: member.userId }),
    })
    assert.equal(withTransfer.status, 204)

    const transferred = await connectionA.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, owner.organizationId),
          eq(memberships.userId, member.userId),
        ),
      )
    assert.equal(transferred[0].role, 'owner')
    const deleted = await connectionA.db
      .select({ status: users.status, deletedAt: users.deletedAt, email: users.email })
      .from(users)
      .where(eq(users.id, owner.userId))
    assert.equal(deleted[0].status, 'disabled')
    assert.ok(deleted[0].deletedAt)
    assert.equal(deleted[0].email, null)
  } finally {
    await close(server)
  }
})

test('falha do provedor nao causa bypass nem registra token', { skip }, async () => {
  const repositories = createPostgresRepositories(connectionA)
  const provider = new TestIdentityProvider()
  provider.failProfiles.add('provider-down')
  const server = authenticatedServer(connectionA, repositories, provider)
  const captured: string[] = []
  const originalError = console.error
  console.error = (...values: unknown[]) => captured.push(values.map(String).join(' '))
  await listen(server)

  try {
    const token = provider.token('provider-down', 'sensitive-session')
    const response = await fetch(`${serverUrl(server)}/v1/me`, authorization(token))
    assert.equal(response.status, 503)
    assert.ok(!captured.join('\n').includes(token))
  } finally {
    console.error = originalError
    await close(server)
  }
})

function sportsBatch(provider: string, externalId: string): SportsImportBatch {
  return {
    datasetKey: provider,
    contentSha256: Buffer.from(provider.padEnd(64, '0')).toString('hex').slice(0, 64),
    rejectedRows: 0,
    duplicateRows: 0,
    ambiguousRows: 0,
    records: [
      {
        sourceProvider: provider,
        externalId,
        competitionExternalId: 'competition-1',
        competitionName: 'Competition Test',
        leagueName: 'Competition Test',
        seasonExternalId: 'competition-1:2026',
        seasonLabel: '2026',
        startsAt: '2027-01-01T12:00:00.000Z',
        status: 'scheduled',
        homeTeam: {
          externalId: 'home-team',
          name: 'Home Team',
          alias: 'Home Team',
          normalizedAlias: 'home team',
        },
        awayTeam: {
          externalId: 'away-team',
          name: 'Away Team',
          alias: 'Away Team',
          normalizedAlias: 'away team',
        },
      },
    ],
  }
}

async function ensureRlsFixture() {
  const provider = `rls-fixture-${randomUUID()}`
  const externalId = randomUUID()
  await createPostgresRepositories(connectionA).sports.importBatch(sportsBatch(provider, externalId))
  const result = await connectionA.pool.query<{ id: string }>(
    `select id::text from sports.fixtures where source_provider = $1 and external_id = $2`,
    [provider, externalId],
  )
  return result.rows[0].id
}

function randomHash() {
  return randomUUID().replaceAll('-', '').repeat(2).slice(0, 64)
}

const silentJobLogger: SafeJobLogger = {
  info() {},
  error() {},
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Condicao nao atendida em ${timeoutMs}ms.`)
}

function postgresCode(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } }
  return value.code ?? value.cause?.code
}

function listen(server: ReturnType<typeof createBetIntelHttpServer>) {
  return server.listen({ port: 0, host: '127.0.0.1' }).then(() => undefined)
}

function close(server: ReturnType<typeof createBetIntelHttpServer>) {
  return server.close()
}

function serverUrl(server: ReturnType<typeof createBetIntelHttpServer>) {
  const address = server.server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem endereco TCP.')
  return `http://127.0.0.1:${address.port}`
}

function quoteIdentifier(value: string) {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error('Identificador SQL de teste inválido.')
  return `"${value}"`
}

function authenticatedServer(
  connection: DatabaseConnection,
  repositories: ReturnType<typeof createPostgresRepositories>,
  provider: IdentityProvider,
  options: Partial<HttpServerDependencies> = {},
) {
  return createBetIntelHttpServer({
    connection,
    repositories,
    identityService: new IdentityService(provider, repositories.identity),
    organizationService: new OrganizationService(repositories.organizations, provider),
    corsAllowedOrigins: ['http://localhost:5173'],
    requestIpHashKey: 'integration-test-only-ip-hash-key',
    logger: false,
    ...options,
  })
}

function authorization(token: string) {
  return { headers: { authorization: `Bearer ${token}` } }
}

async function responseActor(
  server: ReturnType<typeof createBetIntelHttpServer>,
  token: string,
) {
  const response = await fetch(`${serverUrl(server)}/v1/me`, authorization(token))
  assert.equal(response.status, 200)
  return (await response.json()) as {
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'member' | 'viewer'
  }
}

class TestIdentityProvider implements IdentityProvider {
  readonly profiles = new Map<string, ProviderUser>()
  readonly sessions = new Map<string, ProviderSession & { subject: string }>()
  readonly failProfiles = new Set<string>()

  token(subject: string, sessionId: string) {
    if (!this.profiles.has(subject)) {
      this.profiles.set(subject, {
        subject,
        email: `${subject.replace(/[^a-z0-9]/gi, '.')}@example.test`,
        emailVerified: true,
        displayName: 'Integration Test User',
        updatedAt: new Date().toISOString(),
        blocked: false,
      })
    }
    this.sessions.set(sessionId, {
      id: sessionId,
      subject,
      createdAt: new Date().toISOString(),
      authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      lastSeenAt: new Date().toISOString(),
    })
    return `${subject}::${sessionId}`
  }

  async verifyAccessToken(token: string): Promise<VerifiedIdentity> {
    const separator = token.lastIndexOf('::')
    if (separator <= 0 || separator === token.length - 2) {
      throw new IdentityError('invalid_token', 'Token inválido.', 401)
    }
    const subject = token.slice(0, separator)
    const sessionId = token.slice(separator + 2)
    const profile = this.profiles.get(subject)
    const session = this.sessions.get(sessionId)
    if (!profile || profile.blocked || session?.subject !== subject) {
      throw new IdentityError('invalid_token', 'Token inválido.', 401)
    }
    return {
      provider: 'auth0',
      subject,
      sessionId,
      issuedAt: new Date().toISOString(),
      expiresAt: session.expiresAt ?? new Date(Date.now() + 300_000).toISOString(),
      authenticatedAt: session.authenticatedAt,
    }
  }

  async getUser(subject: string): Promise<ProviderUser> {
    if (this.failProfiles.has(subject)) throw new Error('provider unavailable')
    const profile = this.profiles.get(subject)
    if (!profile) throw new Error('profile not found')
    return profile
  }

  async listSessions(subject: string): Promise<ProviderSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.subject === subject)
      .map(({ subject: _subject, ...session }) => session)
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async revokeAllSessions(subject: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.subject === subject) this.sessions.delete(id)
    }
  }

  async requestEmailChange(subject: string, newEmail: string): Promise<void> {
    const profile = await this.getUser(subject)
    this.profiles.set(subject, {
      ...profile,
      email: newEmail,
      emailVerified: false,
      updatedAt: new Date().toISOString(),
    })
  }

  async blockUser(subject: string): Promise<void> {
    const profile = await this.getUser(subject)
    this.profiles.set(subject, { ...profile, blocked: true })
    await this.revokeAllSessions(subject)
  }

  async deleteUser(subject: string): Promise<void> {
    await this.revokeAllSessions(subject)
    this.profiles.delete(subject)
  }
}
