import { createHash } from 'node:crypto'
import { buildFeatureTable } from './featureEngineering.js'
import { evaluateModel } from './evaluation.js'
import { runBacktest } from './backtesting.js'
import { marketDefinitions } from './markets.js'
import { trainMarket, trainModel, DEFAULT_MLOPS_SEED, FEATURE_SET_VERSION, MODEL_SCHEMA_VERSION } from './training.js'
import { parseSourceDate } from './import/dateParser.js'
import {
  MARKET_IDS,
  type CsvRow,
  type EngineeredMatchRecord,
  type EvaluationMetric,
  type MarketId,
} from './schemas.js'

export const BASELINE_LABEL = 'Baseline anterior às correções metodológicas'

export interface BaselineReportOptions {
  minRows?: number
  seed?: number
  testRatio?: number
  validationRatio?: number
  /** Limita as linhas do backtest (O(n^2)); usa a janela mais recente. */
  backtestMaxRows?: number
  datasetVersion?: string
  generatedAt?: string
}

export interface MarketAvailability {
  market: MarketId
  displayName: string
  status: 'available' | 'insufficient_data'
  usableRows: number
  reason?: string
}

export interface GroupMetrics {
  group: string
  matches: number
  metrics: EvaluationMetric[] | null
  note?: string
}

export interface BaselineReport {
  label: string
  generatedAt: string
  dataset: {
    version: string
    hash: string
    totalMatches: number
    validMatches: number
    rejectedMatches: number
    rejectionsByCode: Record<string, number>
    period: { from: string; to: string }
    competitions: string[]
    teams: number
    teamSample: string[]
    countByCompetition: Record<string, number>
    countByCompetitionSeason: Record<string, number>
    availableByMarket: MarketAvailability[]
  }
  model: {
    schemaVersion: string
    featureSetVersion: string
    parameters: { minRows: number; seed: number; testRatio: number; validationRatio: number }
  }
  timingsMs: { train: number; evaluate: number; backtest: number }
  metrics: {
    overall: EvaluationMetric[] | null
    byCompetition: GroupMetrics[]
    bySeason: GroupMetrics[]
  }
  backtest: {
    window: 'full' | 'recent-sample'
    evaluatedRows: number
    sampledRows: number
    metrics: EvaluationMetric[]
  }
  coverageByMarket: Array<{ market: MarketId; coverage: number | null; available: boolean }>
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalInstant(record: EngineeredMatchRecord): number | null {
  if (!record.date) return null
  try {
    return new Date(parseSourceDate(record.date)).getTime()
  } catch {
    const fallback = new Date(record.date).getTime()
    return Number.isNaN(fallback) ? null : fallback
  }
}

function isoDay(instant: number) {
  return new Date(instant).toISOString().slice(0, 10)
}

function period(records: EngineeredMatchRecord[]): { from: string; to: string } {
  const days = records
    .map((record) => canonicalInstant(record))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)
  if (days.length === 0) return { from: 'unknown', to: 'unknown' }
  return { from: isoDay(days[0]), to: isoDay(days.at(-1)!) }
}

function competitionOf(record: EngineeredMatchRecord) {
  return record.competition ?? record.league ?? 'sem-competicao'
}

function tally(records: EngineeredMatchRecord[], key: (record: EngineeredMatchRecord) => string) {
  const counts: Record<string, number> = {}
  for (const record of records) {
    const bucket = key(record)
    counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => left[0].localeCompare(right[0])))
}

/** Avalia um subconjunto com segurança: retorna null quando não há amostra temporal. */
function safeEvaluate(
  records: EngineeredMatchRecord[],
  options: Required<Pick<BaselineReportOptions, 'minRows' | 'seed' | 'testRatio' | 'validationRatio'>> & {
    generatedAt: string
  },
): EvaluationMetric[] | null {
  try {
    const report = evaluateModel(records, {
      minRows: options.minRows,
      seed: options.seed,
      testRatio: options.testRatio,
      validationRatio: options.validationRatio,
      generatedAt: options.generatedAt,
    })
    return report.metrics
  } catch {
    return null
  }
}

export function buildBaselineReport(
  rawContent: string,
  rows: CsvRow[],
  options: BaselineReportOptions = {},
): BaselineReport {
  const minRows = options.minRows ?? 5
  const seed = options.seed ?? DEFAULT_MLOPS_SEED
  const testRatio = options.testRatio ?? 0.2
  const validationRatio = options.validationRatio ?? 0
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const evalOptions = { minRows, seed, testRatio, validationRatio, generatedAt }

  const featureTable = buildFeatureTable(rows)
  // Datas normalizadas para ISO (canônico) antes de qualquer ordenação/avaliação.
  const records = featureTable.records.map((record) => {
    const instant = canonicalInstant(record)
    return instant === null ? record : { ...record, date: new Date(instant).toISOString() }
  })

  const rejectionsByCode: Record<string, number> = {}
  for (const rejection of featureTable.rejectedRows) {
    rejectionsByCode[rejection.code] = (rejectionsByCode[rejection.code] ?? 0) + 1
  }

  const teams = new Set<string>()
  for (const record of records) {
    if (record.homeTeam) teams.add(record.homeTeam)
    if (record.awayTeam) teams.add(record.awayTeam)
  }

  const availableByMarket: MarketAvailability[] = MARKET_IDS.map((market) => {
    const trained = trainMarket(records, market, minRows)
    return {
      market,
      displayName: marketDefinitions[market].displayName,
      status: trained.status,
      usableRows: trained.usableRows,
      reason: trained.reason,
    }
  })

  // Treino cronometrado.
  const trainStart = process.hrtime.bigint()
  trainModel(records, { minRows, seed, generatedAt })
  const trainMs = Number(process.hrtime.bigint() - trainStart) / 1e6

  // Avaliação geral cronometrada.
  const evalStart = process.hrtime.bigint()
  const overall = safeEvaluate(records, evalOptions)
  const evaluateMs = Number(process.hrtime.bigint() - evalStart) / 1e6

  // Métricas por competição e por temporada.
  const byCompetition: GroupMetrics[] = Object.entries(tally(records, competitionOf)).map(([group, matches]) => {
    const subset = records.filter((record) => competitionOf(record) === group)
    const metrics = safeEvaluate(subset, evalOptions)
    return { group, matches, metrics, note: metrics ? undefined : 'dados_insuficientes para split temporal' }
  })
  const bySeason: GroupMetrics[] = Object.entries(tally(records, (record) => record.season ?? 'sem-temporada')).map(
    ([group, matches]) => {
      const subset = records.filter((record) => (record.season ?? 'sem-temporada') === group)
      const metrics = safeEvaluate(subset, evalOptions)
      return { group, matches, metrics, note: metrics ? undefined : 'dados_insuficientes para split temporal' }
    },
  )

  // Backtest limitado à janela recente (O(n^2) inviabiliza o dataset completo).
  const backtestMaxRows = options.backtestMaxRows ?? 600
  const ordered = [...records].sort(
    (left, right) => (canonicalInstant(left) ?? 0) - (canonicalInstant(right) ?? 0) || left.index - right.index,
  )
  const sampled = ordered.slice(Math.max(0, ordered.length - backtestMaxRows))
  const backtestStart = process.hrtime.bigint()
  let backtestReport
  try {
    backtestReport = runBacktest(sampled, { minRows, initialWindow: Math.max(minRows, 20), seed, generatedAt })
  } catch {
    backtestReport = { evaluatedRows: 0, metrics: [] as EvaluationMetric[] }
  }
  const backtestMs = Number(process.hrtime.bigint() - backtestStart) / 1e6

  const coverageByMarket = MARKET_IDS.map((market) => {
    const metric = overall?.find((item) => item.market === market)
    const available = availableByMarket.find((item) => item.market === market)?.status === 'available'
    return { market, coverage: metric?.coverage ?? null, available }
  })

  return {
    label: BASELINE_LABEL,
    generatedAt,
    dataset: {
      version: options.datasetVersion ?? sha256(rawContent).slice(0, 12),
      hash: sha256(rawContent),
      totalMatches: rows.length,
      validMatches: records.length,
      rejectedMatches: featureTable.rejectedRows.length,
      rejectionsByCode,
      period: period(records),
      competitions: [...new Set(records.map(competitionOf))].sort((left, right) => left.localeCompare(right)),
      teams: teams.size,
      teamSample: [...teams].sort((left, right) => left.localeCompare(right)).slice(0, 20),
      countByCompetition: tally(records, competitionOf),
      countByCompetitionSeason: tally(records, (record) => `${competitionOf(record)}::${record.season ?? 'sem-temporada'}`),
      availableByMarket,
    },
    model: {
      schemaVersion: MODEL_SCHEMA_VERSION,
      featureSetVersion: FEATURE_SET_VERSION,
      parameters: { minRows, seed, testRatio, validationRatio },
    },
    timingsMs: { train: round(trainMs), evaluate: round(evaluateMs), backtest: round(backtestMs) },
    metrics: { overall, byCompetition, bySeason },
    backtest: {
      window: sampled.length < ordered.length ? 'recent-sample' : 'full',
      evaluatedRows: backtestReport.evaluatedRows,
      sampledRows: sampled.length,
      metrics: backtestReport.metrics,
    },
    coverageByMarket,
  }
}

/** Resumo legível para o terminal. */
export function formatBaselineSummary(report: BaselineReport): string {
  const lines: string[] = []
  lines.push(`=== ${report.label} ===`)
  lines.push(`Gerado em: ${report.generatedAt}`)
  lines.push(`Dataset ${report.dataset.version} (sha256 ${report.dataset.hash.slice(0, 16)}…)`)
  lines.push(
    `Partidas: ${report.dataset.totalMatches} totais / ${report.dataset.validMatches} válidas / ${report.dataset.rejectedMatches} rejeitadas`,
  )
  if (Object.keys(report.dataset.rejectionsByCode).length > 0) {
    lines.push(`Rejeições por código: ${JSON.stringify(report.dataset.rejectionsByCode)}`)
  }
  lines.push(`Período: ${report.dataset.period.from} a ${report.dataset.period.to}`)
  lines.push(`Competições (${report.dataset.competitions.length}): ${report.dataset.competitions.join(', ')}`)
  lines.push(`Equipes: ${report.dataset.teams}`)
  lines.push(`Modelo: ${report.model.schemaVersion} / ${report.model.featureSetVersion}`)
  lines.push(
    `Parâmetros: minRows=${report.model.parameters.minRows}, seed=${report.model.parameters.seed}, test=${report.model.parameters.testRatio}, val=${report.model.parameters.validationRatio}`,
  )
  lines.push(
    `Durações (ms): treino=${report.timingsMs.train}, avaliação=${report.timingsMs.evaluate}, backtest=${report.timingsMs.backtest}`,
  )
  lines.push('Mercados disponíveis:')
  for (const market of report.dataset.availableByMarket) {
    lines.push(`  ${market.market}: ${market.status} (${market.usableRows} linhas)`)
  }
  lines.push('Métricas gerais (mercado: Brier / logLoss / acurácia / cobertura):')
  for (const metric of report.metrics.overall ?? []) {
    lines.push(
      `  ${metric.market}: ${metric.brierScore} / ${metric.logLoss} / ${metric.selectionAccuracy}% / ${metric.coverage}%`,
    )
  }
  lines.push('Métricas por competição (Brier médio | n avaliado):')
  for (const group of report.metrics.byCompetition) {
    lines.push(`  ${group.group}: ${meanBrier(group.metrics)} (${group.matches} partidas)${group.note ? ` — ${group.note}` : ''}`)
  }
  lines.push('Métricas por temporada (Brier médio | n avaliado):')
  for (const group of report.metrics.bySeason) {
    lines.push(`  ${group.group}: ${meanBrier(group.metrics)} (${group.matches} partidas)${group.note ? ` — ${group.note}` : ''}`)
  }
  lines.push(
    `Backtest (${report.backtest.window}, ${report.backtest.sampledRows} linhas, ${report.backtest.evaluatedRows} avaliadas).`,
  )
  lines.push('AVISO: baseline anterior às correções metodológicas — não usar como evidência científica.')
  return lines.join('\n')
}

function meanBrier(metrics: EvaluationMetric[] | null) {
  if (!metrics || metrics.length === 0) return 'n/d'
  return String(round(metrics.reduce((sum, metric) => sum + metric.brierScore, 0) / metrics.length, 4))
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
