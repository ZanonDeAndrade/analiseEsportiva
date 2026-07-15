import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  ModelRepository,
  NormalizedSportsRecord,
  SportsImportBatch,
  SportsRepository,
} from '../application/ports/persistence.js'
import { parseCsv } from '../csv.js'
import type {
  BacktestReport,
  BetIntelModel,
  CsvRow,
  EvaluationReport,
  FixtureRecord,
} from '../schemas.js'
import { normalizeTeamAlias, teamKey } from '../teamNames.js'
import { parseSourceDate } from './dateParser.js'

export interface LocalStateImportOptions {
  dataDirectory?: string
  artifactsDirectory?: string
  dryRun?: boolean
  allowDemoData?: boolean
}

export interface ImportIssue {
  source: string
  row: number | string
  code: string
  message: string
}

export interface LocalStateImportReport {
  startedAt: string
  completedAt: string
  dryRun: boolean
  accepted: number
  inserted: number
  rejected: number
  duplicates: number
  ambiguous: number
  alreadyImported: boolean
  datasetVersionId: string | null
  modelImported: boolean
  evaluationsImported: number
  issues: ImportIssue[]
  warnings: string[]
}

interface ImportRepositories {
  sports: SportsRepository
  models: ModelRepository
}

export function prepareSportsImportBatch(input: {
  rows: CsvRow[]
  fixtures: FixtureRecord[]
  datasetKey: string
  contentSha256?: string
  allowDemoData?: boolean
}) {
  const issues: ImportIssue[] = []
  const normalized: NormalizedSportsRecord[] = []

  input.rows.forEach((row, index) => {
    try {
      normalized.push(normalizeCsvRow(row, index + 1, input.allowDemoData === true))
    } catch (error) {
      issues.push(issue('provider-row', index + 1, error))
    }
  })
  input.fixtures.forEach((fixture, index) => {
    try {
      normalized.push(normalizeFixture(fixture, index + 1, input.allowDemoData === true))
    } catch (error) {
      issues.push(issue('provider-fixture', index + 1, error))
    }
  })

  const deduped = deduplicateRecords(normalized, issues)
  const ambiguous = detectAmbiguousAliases(deduped.records, issues)
  const records = deduped.records.filter(
    (record) =>
      !ambiguous.conflictingTeamKeys.has(
        `${record.sourceProvider}\u0000${record.homeTeam.externalId}`,
      ) &&
      !ambiguous.conflictingTeamKeys.has(
        `${record.sourceProvider}\u0000${record.awayTeam.externalId}`,
      ),
  )
  const batch: SportsImportBatch = {
    datasetKey: input.datasetKey,
    contentSha256:
      input.contentSha256 ?? sha256(JSON.stringify({ rows: input.rows, fixtures: input.fixtures })),
    records,
    rejectedRows: issues.filter((item) => item.code !== 'duplicate').length,
    duplicateRows: deduped.duplicates,
    ambiguousRows: ambiguous.count,
  }

  return { batch, issues }
}

export async function importLocalState(
  repositories: ImportRepositories,
  options: LocalStateImportOptions = {},
): Promise<LocalStateImportReport> {
  const startedAt = new Date().toISOString()
  const dataDirectory = resolve(options.dataDirectory ?? 'backend/data')
  const artifactsDirectory = resolve(options.artifactsDirectory ?? 'backend/artifacts')
  const issues: ImportIssue[] = []
  const warnings: string[] = []
  const records: NormalizedSportsRecord[] = []
  const contentParts: string[] = []

  const csvPath = join(dataDirectory, 'combined-results.csv')
  if (existsSync(csvPath)) {
    const content = await readFile(csvPath, 'utf8')
    contentParts.push(`combined-results.csv\n${content}`)
    const rows = parseCsv(content)
    rows.forEach((row, index) => {
      try {
        records.push(normalizeCsvRow(row, index + 2, options.allowDemoData === true))
      } catch (error) {
        issues.push(issue(csvPath, index + 2, error))
      }
    })
  } else {
    warnings.push(`Arquivo historico ausente: ${csvPath}`)
  }

  const fixturesPath = join(dataDirectory, 'fixtures.json')
  if (existsSync(fixturesPath)) {
    const content = await readFile(fixturesPath, 'utf8')
    contentParts.push(`fixtures.json\n${content}`)
    const fixtureRows = parseFixtureFile(content, fixturesPath)
    fixtureRows.forEach((fixture, index) => {
      try {
        records.push(normalizeFixture(fixture, index + 1, options.allowDemoData === true))
      } catch (error) {
        issues.push(issue(fixturesPath, index + 1, error))
      }
    })
  } else {
    warnings.push(`Arquivo de fixtures ausente: ${fixturesPath}`)
  }

  if (contentParts.length === 0) {
    throw new Error('Nenhum arquivo local de dados foi encontrado para importacao.')
  }

  const deduped = deduplicateRecords(records, issues)
  const ambiguous = detectAmbiguousAliases(deduped.records, issues)
  const cleanRecords = deduped.records.filter(
    (record) =>
      !ambiguous.conflictingTeamKeys.has(
        `${record.sourceProvider}\u0000${record.homeTeam.externalId}`,
      ) &&
      !ambiguous.conflictingTeamKeys.has(
        `${record.sourceProvider}\u0000${record.awayTeam.externalId}`,
      ),
  )
  const contentSha256 = sha256(
    JSON.stringify(
      [...cleanRecords].sort((left, right) =>
        `${left.sourceProvider}\u0000${left.externalId}`.localeCompare(
          `${right.sourceProvider}\u0000${right.externalId}`,
        ),
      ),
    ),
  )
  const batch: SportsImportBatch = {
    datasetKey: 'legacy-local-state',
    contentSha256,
    records: cleanRecords,
    rejectedRows: issues.filter((item) => item.code !== 'duplicate').length,
    duplicateRows: deduped.duplicates,
    ambiguousRows: ambiguous.count,
  }
  const preview = await repositories.sports.previewImport(batch)

  let datasetVersionId: string | null = preview.datasetVersionId
  let inserted = 0
  let alreadyImported = Boolean(preview.datasetVersionId)
  let persistedDuplicates = preview.existingRecords + deduped.duplicates

  if (!options.dryRun) {
    const persisted = await repositories.sports.importBatch(batch)
    datasetVersionId = persisted.datasetVersionId
    inserted = persisted.inserted
    alreadyImported = persisted.alreadyImported
    persistedDuplicates = persisted.duplicates
  }

  const artifacts = await readArtifacts(artifactsDirectory, issues, warnings)
  let modelImported = false
  let evaluationsImported = 0

  if (!options.dryRun && artifacts.model) {
    await repositories.models.saveModel(artifacts.model, datasetVersionId ?? undefined)
    modelImported = true

    if (artifacts.evaluation) {
      await repositories.models.saveEvaluation('evaluation', artifacts.evaluation)
      evaluationsImported += 1
    }
    if (artifacts.backtest) {
      await repositories.models.saveEvaluation('backtest', artifacts.backtest)
      evaluationsImported += 1
    }
  } else if (options.dryRun && artifacts.model) {
    modelImported = true
    evaluationsImported = Number(Boolean(artifacts.evaluation)) + Number(Boolean(artifacts.backtest))
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    dryRun: options.dryRun === true,
    accepted: cleanRecords.length,
    inserted,
    rejected: issues.filter((item) => item.code !== 'duplicate').length,
    duplicates: persistedDuplicates,
    ambiguous: ambiguous.count,
    alreadyImported,
    datasetVersionId,
    modelImported,
    evaluationsImported,
    issues,
    warnings,
  }
}

function normalizeCsvRow(row: CsvRow, rowNumber: number, allowDemoData: boolean): NormalizedSportsRecord {
  const sourceProvider = required(row.SourceProvider, 'SourceProvider', 'legacy-file')
  rejectDemoProvider(sourceProvider, allowDemoData)
  const competitionName = required(row.Competition ?? row.League, 'Competition/League')
  const competitionExternalId = normalizeIdentifier(row.Div ?? competitionName)
  const seasonLabel = optional(row.Season)
  const startsAt = parseSourceDate(required(row.Date, 'Date'))
  const homeName = required(row.HomeTeam, 'HomeTeam')
  const awayName = required(row.AwayTeam, 'AwayTeam')
  const homeGoals = nonNegativeInteger(required(row.FTHG, 'FTHG'), 'FTHG')
  const awayGoals = nonNegativeInteger(required(row.FTAG, 'FTAG'), 'FTAG')
  const computedOutcome = homeGoals > awayGoals ? 'H' : homeGoals < awayGoals ? 'A' : 'D'
  const suppliedOutcome = optional(row.FTR)

  if (suppliedOutcome && suppliedOutcome !== computedOutcome) {
    throw codedError(
      'outcome_mismatch',
      `FTR ${suppliedOutcome} diverge do placar ${homeGoals}-${awayGoals}.`,
    )
  }

  const externalId =
    optional(row.ExternalFixtureId) ??
    `legacy-${sha256(
      [
        sourceProvider,
        competitionExternalId,
        seasonLabel ?? '',
        startsAt,
        teamKey(homeName),
        teamKey(awayName),
      ].join('|'),
    )}`

  return {
    sourceProvider,
    externalId,
    competitionExternalId,
    competitionName,
    leagueName: row.League ?? competitionName,
    seasonExternalId: seasonLabel ? `${competitionExternalId}:${normalizeIdentifier(seasonLabel)}` : undefined,
    seasonLabel,
    startsAt,
    status: 'finished',
    rawStatus: 'FT',
    sourceUpdatedAt: optionalDate(row.UpdatedAt),
    homeTeam: normalizeTeam(sourceProvider, homeName),
    awayTeam: normalizeTeam(sourceProvider, awayName),
    result: { homeGoals, awayGoals, outcome: computedOutcome },
    stats: optionalStats(row),
  }
}

function normalizeFixture(
  fixture: FixtureRecord,
  rowNumber: number,
  allowDemoData: boolean,
): NormalizedSportsRecord {
  const sourceProvider = required(fixture.sourceProvider, 'sourceProvider')
  rejectDemoProvider(sourceProvider, allowDemoData)
  const startsAt = parseSourceDate(required(fixture.isoDate, 'isoDate'))
  const competitionName = required(fixture.competition, 'competition')
  const competitionExternalId = normalizeIdentifier(fixture.leagueId || competitionName)
  const seasonLabel = optional(fixture.season)
  const homeName = required(fixture.homeTeam, 'homeTeam')
  const awayName = required(fixture.awayTeam, 'awayTeam')

  return {
    sourceProvider,
    externalId: String(fixture.fixtureId ?? required(fixture.id, 'id')),
    competitionExternalId,
    competitionName,
    leagueName: fixture.league || competitionName,
    seasonExternalId: seasonLabel ? `${competitionExternalId}:${normalizeIdentifier(seasonLabel)}` : undefined,
    seasonLabel,
    startsAt,
    status: normalizeFixtureStatus(fixture.status),
    rawStatus: fixture.status,
    round: optional(fixture.round),
    sourceUpdatedAt: optionalDate(fixture.updatedAt),
    homeTeam: normalizeTeam(sourceProvider, homeName),
    awayTeam: normalizeTeam(sourceProvider, awayName),
  }
}

function normalizeTeam(sourceProvider: string, name: string) {
  const normalizedAlias = normalizeTeamAlias(name)
  const canonical = teamKey(name)
  return {
    externalId: canonical,
    name,
    alias: name,
    normalizedAlias,
  }
}

function deduplicateRecords(records: NormalizedSportsRecord[], issues: ImportIssue[]) {
  const byKey = new Map<string, NormalizedSportsRecord>()
  const conflictingKeys = new Set<string>()
  let duplicates = 0

  records.forEach((record, index) => {
    const key = `${record.sourceProvider}\u0000${record.externalId}`
    if (conflictingKeys.has(key)) {
      duplicates += 1
      issues.push({
        source: record.sourceProvider,
        row: index + 1,
        code: 'duplicate_conflict',
        message: `Identificador externo permanece ambiguo: ${record.externalId}.`,
      })
      return
    }
    const previous = byKey.get(key)
    if (!previous) {
      byKey.set(key, record)
      return
    }

    duplicates += 1
    if (JSON.stringify(previous) !== JSON.stringify(record)) {
      issues.push({
        source: record.sourceProvider,
        row: index + 1,
        code: 'duplicate_conflict',
        message: `Identificador externo duplicado com conteudo divergente: ${record.externalId}.`,
      })
      byKey.delete(key)
      conflictingKeys.add(key)
    } else {
      issues.push({
        source: record.sourceProvider,
        row: index + 1,
        code: 'duplicate',
        message: `Linha duplicada por fonte/identificador: ${record.externalId}.`,
      })
    }
  })

  return { records: [...byKey.values()], duplicates }
}

function detectAmbiguousAliases(records: NormalizedSportsRecord[], issues: ImportIssue[]) {
  const aliases = new Map<string, string>()
  const conflictingTeamKeys = new Set<string>()
  let count = 0

  for (const record of records) {
    for (const team of [record.homeTeam, record.awayTeam]) {
      const key = `${record.sourceProvider}\u0000${team.normalizedAlias}`
      const previous = aliases.get(key)
      if (previous && previous !== team.externalId) {
        count += 1
        conflictingTeamKeys.add(`${record.sourceProvider}\u0000${previous}`)
        conflictingTeamKeys.add(`${record.sourceProvider}\u0000${team.externalId}`)
        issues.push({
          source: record.sourceProvider,
          row: record.externalId,
          code: 'ambiguous_team_alias',
          message: `Alias "${team.alias}" aponta para mais de um time canonico.`,
        })
      } else {
        aliases.set(key, team.externalId)
      }
    }
  }

  return { count, conflictingTeamKeys }
}

async function readArtifacts(
  directory: string,
  issues: ImportIssue[],
  warnings: string[],
): Promise<{
  model: BetIntelModel | null
  evaluation: EvaluationReport | null
  backtest: BacktestReport | null
}> {
  const model = await readValidatedJson<BetIntelModel>(join(directory, 'model.json'), issues, warnings, isModel)
  const evaluation = await readValidatedJson<EvaluationReport>(
    join(directory, 'evaluation.json'),
    issues,
    warnings,
    isEvaluation,
  )
  const backtest = await readValidatedJson<BacktestReport>(
    join(directory, 'backtest.json'),
    issues,
    warnings,
    isBacktest,
  )
  return { model, evaluation, backtest }
}

async function readValidatedJson<T>(
  path: string,
  issues: ImportIssue[],
  warnings: string[],
  validate: (value: unknown) => value is T,
): Promise<T | null> {
  if (!existsSync(path)) {
    warnings.push(`Artefato opcional ausente: ${path}`)
    return null
  }

  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!validate(value)) throw new Error('schema do artefato nao reconhecido')
    return value
  } catch (error) {
    issues.push(issue(path, 'arquivo', error, 'invalid_artifact'))
    return null
  }
}

function parseFixtureFile(content: string, path: string): FixtureRecord[] {
  const value: unknown = JSON.parse(content)
  if (!Array.isArray(value)) throw new Error(`O arquivo ${path} deve conter um array JSON.`)
  return value as FixtureRecord[]
}

function optionalStats(row: CsvRow) {
  const values = {
    homeCorners: optionalInteger(row.HC, 'HC'),
    awayCorners: optionalInteger(row.AC, 'AC'),
    homeYellowCards: optionalInteger(row.HY, 'HY'),
    awayYellowCards: optionalInteger(row.AY, 'AY'),
    homeRedCards: optionalInteger(row.HR, 'HR'),
    awayRedCards: optionalInteger(row.AR, 'AR'),
  }
  return Object.values(values).some((value) => value !== undefined) ? values : undefined
}

function optionalInteger(value: string | undefined, field: string) {
  const parsed = optional(value)
  return parsed === undefined ? undefined : nonNegativeInteger(parsed, field)
}

function nonNegativeInteger(value: string, field: string) {
  if (!/^\d+$/.test(value)) throw codedError('invalid_number', `${field} deve ser inteiro nao negativo.`)
  return Number(value)
}

function required(value: string | undefined, field: string, fallback?: string) {
  const normalized = value?.trim() || fallback
  if (!normalized) throw codedError('required_field', `${field} e obrigatorio.`)
  return normalized
}

function optional(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function optionalDate(value: string | undefined) {
  const normalized = optional(value)
  return normalized ? parseSourceDate(normalized) : undefined
}

function normalizeIdentifier(value: string) {
  return teamKey(value).replaceAll(' ', '-')
}

function normalizeFixtureStatus(value: string): NormalizedSportsRecord['status'] {
  const status = value.trim().toUpperCase()
  if (['NS', 'TBD'].includes(status)) return 'scheduled'
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(status)) return 'live'
  if (['FT', 'AET', 'PEN'].includes(status)) return 'finished'
  if (['PST', 'POSTPONED'].includes(status)) return 'postponed'
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(status)) return 'cancelled'
  return 'unknown'
}

function rejectDemoProvider(provider: string, allowDemoData: boolean) {
  if (!allowDemoData && /mock|fallback|simulad/i.test(provider)) {
    throw codedError(
      'demo_data_forbidden',
      `Fonte simulada "${provider}" rejeitada. Use --allow-demo-data somente fora de producao.`,
    )
  }
}

function issue(
  source: string,
  row: number | string,
  error: unknown,
  fallbackCode = 'invalid_row',
): ImportIssue {
  const coded = error as Error & { code?: string }
  return {
    source,
    row,
    code: coded.code ?? fallbackCode,
    message: error instanceof Error ? error.message : 'Erro de importacao desconhecido.',
  }
}

function codedError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

function isModel(value: unknown): value is BetIntelModel {
  const item = value as Partial<BetIntelModel> | null
  return Boolean(item && item.version === 1 && item.markets && typeof item.trainingRows === 'number')
}

function isEvaluation(value: unknown): value is EvaluationReport {
  const item = value as Partial<EvaluationReport> | null
  return Boolean(item && typeof item.generatedAt === 'string' && Array.isArray(item.metrics) && Array.isArray(item.ignoredMarkets))
}

function isBacktest(value: unknown): value is BacktestReport {
  const item = value as Partial<BacktestReport> | null
  return Boolean(item && typeof item.generatedAt === 'string' && Array.isArray(item.metrics) && typeof item.initialWindow === 'number')
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
