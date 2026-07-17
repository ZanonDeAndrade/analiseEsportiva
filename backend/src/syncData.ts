import { createHash } from 'node:crypto'
import { fixtureWindow, providerSnapshotCacheTtlMs, providerUseConfiguration } from './config.js'
import type { SportsRepository, SystemStateRepository } from './application/ports/persistence.js'
import { prepareSportsImportBatch, type ImportIssue } from './import/localStateImporter.js'
import {
  buildApiFootballFixtureTargets,
  fetchApiFootballHistoricalResults,
  fetchApiFootballTargetFixtures,
  historyDateRange,
} from './providers/apiFootballProvider.js'
import type { ApiFootballFetchLike } from './providers/apiFootballProvider.js'
import { buildFootballDataSources, fetchFootballDataCsv } from './providers/footballDataProvider.js'
import type { FootballDataFetchLike } from './providers/footballDataProvider.js'
import {
  fetchFootballDataOrgFixtures,
  fetchFootballDataOrgHistory,
  FOOTBALL_DATA_ORG_TARGETS,
} from './providers/footballDataOrgProvider.js'
import type { FootballDataOrgFetchLike } from './providers/footballDataOrgProvider.js'
import type { CsvRow, FixtureRecord, SyncReport } from './schemas.js'
import type { SportsDataProviderAdapter, SportsProviderSnapshot } from './application/ports/sportsProvider.js'

export interface SyncDataOptions {
  includeFootballData?: boolean
  includeApiHistory?: boolean
  apiHistoryYears?: number
  apiFootballFetcher?: ApiFootballFetchLike
  footballDataFetcher?: FootballDataFetchLike
  footballDataOrgFetcher?: FootballDataOrgFetchLike
  beforePersist?: () => Promise<void>
}

export interface SyncDataDependencies {
  sports: SportsRepository
  systemState: SystemStateRepository
}

export async function syncData(
  dependencies: SyncDataDependencies,
  options: SyncDataOptions = {},
): Promise<SyncReport> {
  const includeFootballData = options.includeFootballData
    ?? process.env.BETINTEL_ENABLE_FOOTBALL_DATA === 'true'
  const includeApiHistory = options.includeApiHistory ?? process.env.BETINTEL_SYNC_API_HISTORY !== 'false'
  const apiHistoryYears = historyYears(options.apiHistoryYears)
  const rows: CsvRow[] = []
  let fixtures: FixtureRecord[] = []
  const warnings: string[] = []
  let usedApiFootball = false
  let usedFootballData = false
  let usedFootballDataOrg = false
  const apiKey = process.env.API_FOOTBALL_KEY
  const footballDataOrgApiKey = process.env.FOOTBALL_DATA_ORG_API_KEY?.trim()
  const { from, to } = fixtureWindow()
  const adapters: SportsDataProviderAdapter[] = []
  const providerPolicies: Array<{
    provider: string
    policyReference: string
    licenseReference: string
  }> = []

  if (apiKey) {
    const use = providerUseConfiguration('api-football')
    adapters.push({
      provider: 'api-football',
      async fetchSnapshot() {
        const current = footballDataOrgApiKey
          ? {
              rows: [],
              fixtures: [],
              warnings: ['Agenda atual obtida pelo provedor football-data.org para evitar partidas duplicadas entre fontes.'],
              updatedAt: new Date().toISOString(),
            }
          : await fetchApiFootballTargetFixtures({ apiKey, from, to, fetcher: options.apiFootballFetcher })
        const historical = includeApiHistory
          ? await fetchApiFootballHistoricalResults({ apiKey, years: apiHistoryYears, fetcher: options.apiFootballFetcher })
          : { rows: [], fixtures: [], warnings: [], updatedAt: current.updatedAt }
        if (includeApiHistory && historical.rows.length === 0) {
          const range = historyDateRange(apiHistoryYears)
          historical.warnings.push(`API-Football nao retornou historico no periodo ${range.from} a ${range.to}.`)
        }
        return {
          provider: 'api-football',
          fetchedAt: current.updatedAt,
          policyReference: use.policyReference,
          licenseReference: use.licenseReference,
          rows: [...current.rows, ...historical.rows],
          fixtures: current.fixtures,
          warnings: [...current.warnings, ...historical.warnings],
        }
      },
    })
  } else {
    warnings.push(
      `API_FOOTBALL_KEY ausente; fixtures futuras nao serao inventadas. Competicoes alvo: ${buildApiFootballFixtureTargets().map((target) => target.name).join(', ')}.`,
    )
  }

  if (includeFootballData) {
    const use = providerUseConfiguration('football-data')
    adapters.push({
      provider: 'football-data',
      async fetchSnapshot() {
        const providerRows: CsvRow[] = []
        const providerWarnings: string[] = []
        for (const source of buildFootballDataSources(apiHistoryYears)) {
          try {
            providerRows.push(...await fetchFootballDataCsv({ ...source, sourceUrl: source.url, fetcher: options.footballDataFetcher }))
          } catch (error) {
            providerWarnings.push(`Football-Data indisponivel para ${source.league} ${source.season}: ${message(error)}`)
          }
        }
        return {
          provider: 'football-data', fetchedAt: new Date().toISOString(),
          policyReference: use.policyReference, licenseReference: use.licenseReference,
          rows: providerRows, fixtures: [], warnings: providerWarnings,
        }
      },
    })
  }

  if (footballDataOrgApiKey) {
    const use = providerUseConfiguration('football-data-org')
    adapters.push({
      provider: 'football-data-org',
      async fetchSnapshot() {
        const current = await fetchFootballDataOrgFixtures({
          apiKey: footballDataOrgApiKey,
          from,
          to,
          fetcher: options.footballDataOrgFetcher,
        })
        const brasileirao = FOOTBALL_DATA_ORG_TARGETS.find((target) => target.code === 'BSA')!
        const historicalRows: CsvRow[] = []
        const historicalWarnings: string[] = []
        const currentSeason = new Date().getUTCFullYear()
        for (let offset = apiHistoryYears - 1; offset >= 0; offset -= 1) {
          const season = currentSeason - offset
          try {
            const historical = await fetchFootballDataOrgHistory({
              apiKey: footballDataOrgApiKey,
              target: brasileirao,
              season,
              fetcher: options.footballDataOrgFetcher,
            })
            historicalRows.push(...historical.rows)
            historicalWarnings.push(...historical.warnings)
          } catch (error) {
            historicalWarnings.push(`Historico football-data.org indisponivel para BSA ${season}: ${message(error)}`)
          }
        }
        return {
          provider: 'football-data-org',
          fetchedAt: current.updatedAt,
          policyReference: use.policyReference,
          licenseReference: use.licenseReference,
          rows: [...historicalRows, ...current.rows],
          fixtures: current.fixtures,
          warnings: [...current.warnings, ...historicalWarnings],
        }
      },
    })
  } else {
    warnings.push('FOOTBALL_DATA_ORG_API_KEY ausente; o provedor complementar de jogos futuros nao esta habilitado.')
  }

  for (const adapter of adapters) {
    const cacheKey = `sports_provider_snapshot:${adapter.provider}`
    const cached = await dependencies.systemState.get<SportsProviderSnapshot & Record<string, unknown>>(cacheKey)
    const cacheIsCurrent = cached
      ? Date.now() - new Date(cached.fetchedAt).getTime() <= providerSnapshotCacheTtlMs()
      : false
    try {
      const snapshot = cacheIsCurrent ? cached! : await adapter.fetchSnapshot()
      if (!cacheIsCurrent) {
        await dependencies.systemState.set(cacheKey, snapshot as unknown as Record<string, unknown>)
      } else {
        warnings.push(`Snapshot atual de ${adapter.provider} reutilizado do cache operacional.`)
      }
      rows.push(...snapshot.rows)
      fixtures = [...fixtures, ...snapshot.fixtures]
      warnings.push(...snapshot.warnings)
      providerPolicies.push({
        provider: snapshot.provider,
        policyReference: snapshot.policyReference,
        licenseReference: snapshot.licenseReference,
      })
      if (adapter.provider === 'api-football') usedApiFootball = snapshot.rows.length > 0 || snapshot.fixtures.length > 0
      if (adapter.provider === 'football-data') usedFootballData = snapshot.rows.length > 0
      if (adapter.provider === 'football-data-org') usedFootballDataOrg = snapshot.rows.length > 0 || snapshot.fixtures.length > 0
    } catch (error) {
      warnings.push(`${adapter.provider} indisponivel: ${message(error)} Cache vencido nao foi promovido a dado atual.`)
    }
  }

  if (rows.length === 0 && fixtures.length === 0) {
    throw new Error(
      `Nenhuma fonte real retornou dados. A sincronizacao foi abortada sem fallback simulado. ${warnings.join(' ')}`,
    )
  }

  const contentSha256 = createHash('sha256')
    .update(JSON.stringify({ rows, fixtures }))
    .digest('hex')
  const prepared = prepareSportsImportBatch({
    rows,
    fixtures,
    datasetKey: 'provider-sync',
    contentSha256,
    allowDemoData: false,
  })
  prepared.batch.providerPolicies = providerPolicies

  if (prepared.batch.records.length === 0) {
    throw new Error(
      `Todas as linhas recebidas foram rejeitadas: ${prepared.issues.map((item) => item.message).join(' ')}`,
    )
  }

  await options.beforePersist?.()

  const imported = await dependencies.sports.importBatch(prepared.batch)
  const generatedAt = new Date().toISOString()
  const report: SyncReport = {
    generatedAt,
    sourceProvider: sourceProvider(rows, fixtures),
    storage: 'postgresql',
    datasetVersionId: imported.datasetVersionId,
    fixtures: fixtures.length,
    resultRows: rows.length,
    acceptedRows: imported.accepted,
    rejectedRows: prepared.batch.rejectedRows,
    duplicateRows: imported.duplicates,
    correctedResults: imported.correctedResults,
    usedApiFootball,
    usedFootballData,
    usedFootballDataOrg,
    simulated: false,
    importIssues: prepared.issues,
    warnings,
  }

  await dependencies.systemState.set('sports_sync', report as unknown as Record<string, unknown>)
  return report
}

function sourceProvider(rows: CsvRow[], fixtures: FixtureRecord[]) {
  const providers = new Set([
    ...rows.map((row) => row.SourceProvider).filter((value): value is string => Boolean(value)),
    ...fixtures.map((fixture) => fixture.sourceProvider),
  ])
  return [...providers].join(', ') || 'unknown'
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'erro desconhecido'
}

function historyYears(value: number | undefined) {
  const raw = value ?? Number(process.env.BETINTEL_API_HISTORY_YEARS ?? 5)
  if (!Number.isFinite(raw) || raw < 1) return 5
  return Math.min(10, Math.floor(raw))
}

export type { ImportIssue }
