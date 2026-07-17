import assert from 'node:assert/strict'
import test from 'node:test'
import { syncData, type SyncDataDependencies } from './syncData.js'
import type { SportsImportBatch } from './application/ports/persistence.js'

test('API fora do ar aborta sem calendario estatico ou fallback ficticio', async () => {
  await withProviderEnvironment(async () => {
    await assert.rejects(
      syncData(fakeDependencies(), {
        includeFootballData: false,
        includeApiHistory: false,
        apiFootballFetcher: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      }),
      /Nenhuma fonte real retornou dados/,
    )
  })
})

test('cache operacional atual e idempotente evita nova chamada externa', async () => {
  await withProviderEnvironment(async () => {
    const state = new Map<string, Record<string, unknown>>()
    state.set('sports_provider_snapshot:api-football', {
      provider: 'api-football',
      fetchedAt: new Date().toISOString(),
      policyReference: 'policy-test',
      licenseReference: 'license-test',
      rows: [{
        SourceProvider: 'api-football', ExternalFixtureId: 'cached-1', Div: 'TST',
        Competition: 'Liga Teste', League: 'Liga Teste', Season: '2026',
        Date: '2026-07-15T23:00:00Z', HomeTeam: 'A', AwayTeam: 'B',
        FTHG: '1', FTAG: '0', FTR: 'H', UpdatedAt: new Date().toISOString(),
      }],
      fixtures: [],
      warnings: [],
    })
    let externalCalls = 0
    const dependencies = fakeDependencies(state)
    const report = await syncData(dependencies, {
      includeFootballData: false,
      includeApiHistory: false,
      apiFootballFetcher: async () => {
        externalCalls += 1
        return { ok: false, status: 503, json: async () => ({}) }
      },
    })
    assert.equal(externalCalls, 0)
    assert.equal(report.simulated, false)
    assert.equal(report.acceptedRows, 1)
    assert.equal(report.warnings.some((warning) => warning.includes('cache operacional')), true)
  })
})

function fakeDependencies(state = new Map<string, Record<string, unknown>>()) {
  let lastBatch: SportsImportBatch | undefined
  return {
    sports: {
      async importBatch(batch: SportsImportBatch) {
        lastBatch = batch
        return {
          datasetVersionId: '11111111-1111-4111-8111-111111111111',
          accepted: batch.records.length,
          inserted: batch.records.length,
          duplicates: batch.duplicateRows,
          correctedResults: 0,
          alreadyImported: false,
        }
      },
      get lastBatch() { return lastBatch },
    },
    systemState: {
      async get<T extends Record<string, unknown>>(key: string) { return (state.get(key) as T | undefined) ?? null },
      async set(key: string, value: Record<string, unknown>) { state.set(key, value) },
    },
  } as unknown as SyncDataDependencies
}

async function withProviderEnvironment(operation: () => Promise<void>) {
  const keys = [
    'API_FOOTBALL_KEY', 'API_FOOTBALL_USE_POLICY_REFERENCE', 'API_FOOTBALL_LICENSE_REFERENCE',
    'API_FOOTBALL_ALLOWED_ENVIRONMENTS', 'BETINTEL_ENVIRONMENT', 'SPORTS_PROVIDER_CACHE_TTL_MS',
  ] as const
  const previous = new Map(keys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'not-logged',
    API_FOOTBALL_USE_POLICY_REFERENCE: 'policy-test',
    API_FOOTBALL_LICENSE_REFERENCE: 'license-test',
    API_FOOTBALL_ALLOWED_ENVIRONMENTS: 'test',
    BETINTEL_ENVIRONMENT: 'test',
    SPORTS_PROVIDER_CACHE_TTL_MS: '60000',
  })
  try {
    await operation()
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
