import { createHash } from 'node:crypto'
import { fixtureWindow } from './config.js'
import type { SportsRepository, SystemStateRepository } from './application/ports/persistence.js'
import { prepareSportsImportBatch, type ImportIssue } from './import/localStateImporter.js'
import {
  defaultApiFootballFixtureTargets,
  fetchApiFootballHistoricalResults,
  fetchApiFootballTargetFixtures,
  historyDateRange,
} from './providers/apiFootballProvider.js'
import type { ApiFootballFetchLike } from './providers/apiFootballProvider.js'
import { defaultFootballDataSources, fetchFootballDataCsv } from './providers/footballDataProvider.js'
import type { FootballDataFetchLike } from './providers/footballDataProvider.js'
import type { CsvRow, FixtureRecord, SyncReport } from './schemas.js'

export interface SyncDataOptions {
  includeFootballData?: boolean
  includeApiHistory?: boolean
  apiHistoryYears?: number
  apiFootballFetcher?: ApiFootballFetchLike
  footballDataFetcher?: FootballDataFetchLike
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
  const includeFootballData = options.includeFootballData ?? true
  const includeApiHistory = options.includeApiHistory ?? process.env.BETINTEL_SYNC_API_HISTORY !== 'false'
  const apiHistoryYears = historyYears(options.apiHistoryYears)
  const rows: CsvRow[] = []
  let fixtures: FixtureRecord[] = []
  const warnings: string[] = []
  let usedApiFootball = false
  let usedFootballData = false
  const apiKey = process.env.API_FOOTBALL_KEY
  const { from, to } = fixtureWindow()

  if (apiKey) {
    try {
      const result = await fetchApiFootballTargetFixtures({
        apiKey,
        from,
        to,
        fetcher: options.apiFootballFetcher,
      })
      rows.push(...result.rows)
      fixtures = result.fixtures
      warnings.push(...result.warnings)
      usedApiFootball = result.rows.length > 0 || result.fixtures.length > 0
    } catch (error) {
      warnings.push(`API-Football indisponivel: ${message(error)}`)
    }

    if (includeApiHistory) {
      const range = historyDateRange(apiHistoryYears)
      try {
        const result = await fetchApiFootballHistoricalResults({
          apiKey,
          years: apiHistoryYears,
          fetcher: options.apiFootballFetcher,
        })
        rows.push(...result.rows)
        warnings.push(...result.warnings)
        usedApiFootball = usedApiFootball || result.rows.length > 0
        if (result.rows.length === 0) {
          warnings.push(
            `API-Football nao retornou historico no periodo ${range.from} a ${range.to}.`,
          )
        }
      } catch (error) {
        warnings.push(`Historico API-Football indisponivel: ${message(error)}`)
      }
    }
  } else {
    warnings.push(
      `API_FOOTBALL_KEY ausente; fixtures futuras nao serao inventadas. Competicoes alvo: ${defaultApiFootballFixtureTargets.map((target) => target.name).join(', ')}.`,
    )
  }

  if (includeFootballData) {
    for (const source of defaultFootballDataSources) {
      try {
        const sourceRows = await fetchFootballDataCsv({
          url: source.url,
          league: source.league,
          season: source.season,
          sourceUrl: source.url,
          fetcher: options.footballDataFetcher,
        })
        rows.push(...sourceRows)
        usedFootballData = true
      } catch (error) {
        warnings.push(`Football-Data indisponivel para ${source.league}: ${message(error)}`)
      }
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
