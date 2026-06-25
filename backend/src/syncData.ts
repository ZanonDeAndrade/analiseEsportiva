import { dataDir, fixtureWindow, loadLocalEnv } from './config.js'
import {
  combinedCsvPath,
  defaultSchedule,
  readTrainingRows,
  syncMetadataPath,
  writeCsvRows,
  writeFixturesCache,
} from './dataStore.js'
import { writeJson } from './io.js'
import {
  defaultApiFootballFixtureTargets,
  fetchApiFootballHistoricalResults,
  fetchApiFootballTargetFixtures,
  historyDateRange,
} from './providers/apiFootballProvider.js'
import { defaultFootballDataSources, fetchFootballDataCsv } from './providers/footballDataProvider.js'
import type { CsvRow, FixtureRecord, SyncReport } from './schemas.js'

export interface SyncDataOptions {
  includeFootballData?: boolean
  includeApiHistory?: boolean
  apiHistoryYears?: number
}

export async function syncData(options: SyncDataOptions = {}): Promise<SyncReport> {
  loadLocalEnv()

  const includeFootballData = options.includeFootballData ?? true
  const includeApiHistory = options.includeApiHistory ?? process.env.BETINTEL_SYNC_API_HISTORY !== 'false'
  const apiHistoryYears = historyYears(options.apiHistoryYears)
  const rows: CsvRow[] = []
  let fixtures: FixtureRecord[] = []
  const warnings: string[] = []
  let usedApiFootball = false
  let usedFootballData = false

  const apiKey = process.env.API_FOOTBALL_KEY

  const { from, to, days } = fixtureWindow()

  if (apiKey) {
    try {
      const result = await fetchApiFootballTargetFixtures({ apiKey, from, to })
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
        const result = await fetchApiFootballHistoricalResults({ apiKey, years: apiHistoryYears })
        rows.push(...result.rows)
        warnings.push(...result.warnings)
        usedApiFootball = usedApiFootball || result.rows.length > 0

        if (result.rows.length === 0) {
          warnings.push(
            `API-Football nao retornou resultados historicos para treino no periodo ${range.from} a ${range.to}.`,
          )
        }
      } catch (error) {
        warnings.push(`Historico API-Football indisponivel: ${message(error)}`)
      }
    }
  } else {
    const range = historyDateRange(apiHistoryYears)
    warnings.push(
      `API_FOOTBALL_KEY ausente; usando agenda simulada dos proximos ${days} dias (${from} a ${to}) e sem historico API-Football dos ultimos ${apiHistoryYears} anos (${range.from} a ${range.to}). Configure a chave para jogos reais. Competicoes alvo: ${defaultApiFootballFixtureTargets.map((target) => target.name).join(', ')}.`,
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
        })
        rows.push(...sourceRows)
        usedFootballData = true
      } catch (error) {
        warnings.push(`Football-Data indisponivel para ${source.league}: ${message(error)}`)
      }
    }
  }

  if (fixtures.length === 0) fixtures = defaultSchedule()

  // So injeta amostra mock de selecoes se NAO houver nenhum dado real de Copa do
  // Mundo (qualquer ano). Quando ha historico real (ex.: Copa 2022), as linhas
  // mock criariam um segmento "World Cup 2026::2026" raso que sombrearia o
  // segmento real "World Cup" na predicao — deixando todos os jogos iguais.
  const hasWorldCupData = rows.some(
    (row) => row.League === 'World Cup' || (row.Competition ?? '').includes('World Cup'),
  )

  if (!hasWorldCupData) {
    const updatedAt = new Date().toISOString()
    rows.push(
      ...(await readTrainingRows('backend/src/fixtures/sample-results.csv'))
        .filter((row) => row.Competition === 'World Cup 2026')
        .map((row) => ({
          ...row,
          SourceProvider: 'mock-fallback',
          UpdatedAt: updatedAt,
        })),
    )
  }

  if (rows.length === 0) {
    const updatedAt = new Date().toISOString()
    rows.push(
      ...(await readTrainingRows('backend/src/fixtures/sample-results.csv')).map((row) => ({
        ...row,
        SourceProvider: 'mock-fallback',
        UpdatedAt: updatedAt,
      })),
    )
  }

  const finalRows = dedupeCsvRows(rows)

  await writeCsvRows(combinedCsvPath(), finalRows)
  await writeFixturesCache(fixtures)

  const report: SyncReport = {
    generatedAt: new Date().toISOString(),
    sourceProvider: sourceProvider(finalRows, fixtures),
    dataDir: dataDir(),
    fixtures: fixtures.length,
    resultRows: finalRows.length,
    usedApiFootball,
    usedFootballData,
    simulated: fixtures.some((fixture) => fixture.isFallback) || finalRows.some((row) => row.SourceProvider === 'mock-fallback'),
    warnings,
  }

  await writeJson(syncMetadataPath(), report)
  return report
}

function sourceProvider(rows: CsvRow[], fixtures: FixtureRecord[]) {
  const providers = new Set([
    ...rows.map((row) => row.SourceProvider).filter((value): value is string => Boolean(value)),
    ...fixtures.map((fixture) => fixture.sourceProvider),
  ])

  return [...providers].join(', ') || 'local-cache'
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'erro desconhecido'
}

function historyYears(value: number | undefined) {
  const raw = value ?? Number(process.env.BETINTEL_API_HISTORY_YEARS ?? 5)
  if (!Number.isFinite(raw) || raw < 1) return 5
  return Math.min(10, Math.floor(raw))
}

function dedupeCsvRows(rows: CsvRow[]) {
  const map = new Map<string, CsvRow>()

  for (const row of rows) {
    const key = `${row.Date ?? ''}-${row.HomeTeam ?? ''}-${row.AwayTeam ?? ''}-${row.Competition ?? ''}`
    map.set(key, row)
  }

  return [...map.values()]
}
