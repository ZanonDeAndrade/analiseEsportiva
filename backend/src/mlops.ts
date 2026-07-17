import { createHash } from 'node:crypto'
import type {
  CompetitionSplitCount,
  ConfidenceInterval,
  DriftReport,
  EngineeredMatchRecord,
  EvaluationMetric,
  EvaluationReport,
  EvaluationTrace,
  PerformanceDriftReport,
  PromotionDecision,
  TemporalPartition,
  TemporalSplitStrategyReport,
} from './schemas.js'
import { parseSourceDate } from './import/dateParser.js'
import { DEFAULT_MLOPS_SEED, FEATURE_SET_VERSION, MODEL_SCHEMA_VERSION } from './training.js'

export const METRICS_SCHEMA_VERSION = 'probabilistic-metrics-v2'

export class TemporalLeakageError extends Error {
  readonly code = 'temporal_leakage'
  constructor(message: string) {
    super(message)
    this.name = 'TemporalLeakageError'
  }
}

export interface TemporalSplitOptions {
  /** Fração final de cada competição usada como teste (0 < testRatio < 1). */
  testRatio?: number
  /** Fração intermediária reservada para validação (0 <= validationRatio < 1). */
  validationRatio?: number
}

/**
 * Divisão temporal reproduzível, por competição e sem vazamento.
 *
 * As datas são normalizadas para ISO 8601 antes da divisão; linhas com data
 * ausente ou inválida são descartadas e contadas em `report.discardedRows`.
 * Os registros são agrupados por competição e, dentro de cada grupo, ordenados
 * por timestamp crescente: os primeiros `1 - validationRatio - testRatio` viram
 * treino, a fatia seguinte validação e os últimos `testRatio` viram teste. Os
 * grupos são então unidos. Uma mesma partida nunca aparece em dois conjuntos.
 * Não há embaralhamento aleatório: a saída é determinística.
 */
export function temporalSplit(
  records: EngineeredMatchRecord[],
  options: TemporalSplitOptions = {},
) {
  const testRatio = openRatio(options.testRatio, 0.2)
  const validationRatio = closedRatio(options.validationRatio, 0)
  if (validationRatio + testRatio >= 0.9) {
    throw new Error('Validação + teste deve reservar ao menos 10% dos dados para o treino.')
  }
  const trainRatio = 1 - validationRatio - testRatio

  // 1. Normaliza as datas e 2. descarta linhas com data ausente/invalida.
  const dated: Array<{ record: EngineeredMatchRecord; instant: number }> = []
  let discardedRows = 0
  for (const record of records) {
    const instant = normalizedInstant(record)
    if (instant === null) {
      discardedRows += 1
      continue
    }
    dated.push({ record: { ...record, date: new Date(instant).toISOString() }, instant })
  }

  // 3. Agrupa por competição.
  const groups = new Map<string, Array<{ record: EngineeredMatchRecord; instant: number }>>()
  for (const item of dated) {
    const key = competitionKey(item.record)
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }

  const train: EngineeredMatchRecord[] = []
  const validation: EngineeredMatchRecord[] = []
  const test: EngineeredMatchRecord[] = []
  const competitions: CompetitionSplitCount[] = []

  for (const competition of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
    const items = groups.get(competition)!
    // 4. Ordena por timestamp crescente (desempate determinístico por índice).
    items.sort((left, right) => left.instant - right.instant || left.record.index - right.record.index)
    const counts = competitionCounts(items.length, validationRatio, testRatio)
    const trainSlice = items.slice(0, counts.train)
    const validationSlice = items.slice(counts.train, counts.train + counts.validation)
    const testSlice = items.slice(counts.train + counts.validation)
    // 5. Une os grupos após a divisão.
    train.push(...trainSlice.map((item) => item.record))
    validation.push(...validationSlice.map((item) => item.record))
    test.push(...testSlice.map((item) => item.record))
    competitions.push({
      competition,
      total: items.length,
      train: trainSlice.length,
      validation: validationSlice.length,
      test: testSlice.length,
    })
  }

  const byInstant = (left: EngineeredMatchRecord, right: EngineeredMatchRecord) =>
    new Date(left.date!).getTime() - new Date(right.date!).getTime() || left.index - right.index
  train.sort(byInstant)
  validation.sort(byInstant)
  test.sort(byInstant)

  // 6. Garante que uma partida nunca apareça em dois conjuntos.
  assertDisjointPartitions(train, validation, test)

  const partitions = {
    train: partition(train),
    validation: partition(validation),
    test: partition(test),
  }
  const report: TemporalSplitStrategyReport = {
    strategy: 'per_competition_temporal',
    trainRatio: round(trainRatio, 4),
    validationRatio: round(validationRatio, 4),
    testRatio: round(testRatio, 4),
    discardedRows,
    train: partitions.train,
    test: partitions.test,
    competitions,
  }
  return { train, validation, test, partitions, report }
}

function competitionCounts(total: number, validationRatio: number, testRatio: number) {
  if (total <= 1) return { train: total, validation: 0, test: 0 }
  let test = Math.max(1, Math.floor(total * testRatio))
  let validation = validationRatio > 0 ? Math.max(1, Math.floor(total * validationRatio)) : 0
  while (total - test - validation < 1) {
    if (validation > 0) validation -= 1
    else if (test > 1) test -= 1
    else break
  }
  return { train: total - test - validation, validation, test }
}

function competitionKey(record: EngineeredMatchRecord) {
  return record.competition ?? record.league ?? 'sem-competicao'
}

function assertDisjointPartitions(
  train: EngineeredMatchRecord[],
  validation: EngineeredMatchRecord[],
  test: EngineeredMatchRecord[],
) {
  const trainIndices = new Set(train.map((record) => record.index))
  const validationIndices = new Set(validation.map((record) => record.index))
  for (const record of validation) {
    if (trainIndices.has(record.index)) {
      throw new TemporalLeakageError(`Linha ${record.index} apareceu em treino e validação simultaneamente.`)
    }
  }
  for (const record of test) {
    if (trainIndices.has(record.index) || validationIndices.has(record.index)) {
      throw new TemporalLeakageError(`Linha ${record.index} apareceu em teste e em treino/validação simultaneamente.`)
    }
  }
}

export function evaluationTrace(input: {
  seed?: number
  datasetVersionId?: string
  modelVersionId?: string
  codeVersion?: string
  featureSetVersion?: string
  hyperparameters: Record<string, number | string | boolean>
  partitions: { train: TemporalPartition; validation: TemporalPartition; test: TemporalPartition }
}): EvaluationTrace {
  const seed = input.seed ?? DEFAULT_MLOPS_SEED
  const trace = {
    seed,
    codeVersion: input.codeVersion ?? process.env.APP_RELEASE?.trim() ?? 'development',
    datasetVersionId: input.datasetVersionId,
    modelVersionId: input.modelVersionId,
    featureSetVersion: input.featureSetVersion ?? FEATURE_SET_VERSION,
    modelSchemaVersion: MODEL_SCHEMA_VERSION,
    metricsSchemaVersion: METRICS_SCHEMA_VERSION,
    hyperparameters: input.hyperparameters,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  }
  return {
    ...trace,
    runId: createHash('sha256').update(JSON.stringify({ ...trace, partitions: input.partitions })).digest('hex'),
  }
}

export function computeDataDrift(
  reference: EngineeredMatchRecord[],
  current: EngineeredMatchRecord[],
): DriftReport {
  if (reference.length < 5 || current.length < 5) {
    return {
      status: 'dados_insuficientes',
      sampleSize: { reference: reference.length, current: current.length },
      missingnessDelta: {
        corners: missingRate(current, 'totalCorners') - missingRate(reference, 'totalCorners'),
        cards: missingRate(current, 'totalCards') - missingRate(reference, 'totalCards'),
      },
      limitations: ['Amostra menor que 5 em ao menos uma janela; PSI não calculado.'],
    }
  }
  const referenceDistribution = goalDistribution(reference)
  const currentDistribution = goalDistribution(current)
  const psi = round(referenceDistribution.reduce((sum, expected, index) => {
    const actual = currentDistribution[index]
    return sum + (actual - expected) * Math.log(actual / expected)
  }, 0), 6)
  return {
    status: psi >= 0.25 ? 'critical' : psi >= 0.1 ? 'warning' : 'stable',
    sampleSize: { reference: reference.length, current: current.length },
    populationStabilityIndex: psi,
    missingnessDelta: {
      corners: round(missingRate(current, 'totalCorners') - missingRate(reference, 'totalCorners'), 4),
      cards: round(missingRate(current, 'totalCards') - missingRate(reference, 'totalCards'), 4),
    },
    limitations: ['PSI usa faixas de gols totais; mudanças de calendário e competição podem contribuir para o sinal.'],
  }
}

export function assessPromotion(
  metrics: EvaluationMetric[],
  championMetrics?: EvaluationMetric[],
  tolerance = 0.002,
): PromotionDecision {
  if (metrics.length === 0) {
    return { decision: 'hold', reasons: ['Nenhum mercado avaliável; dados_insuficientes preservado.'], evaluatedMarkets: 0 }
  }
  const withoutBaseline = metrics.filter((metric) => metric.baselines.length === 0)
  if (withoutBaseline.length > 0) {
    return { decision: 'reject', reasons: ['Há métricas sem baseline obrigatório.'], evaluatedMarkets: metrics.length }
  }
  const worseThanBaseline = metrics.filter((metric) => {
    const bestBaseline = Math.min(...metric.baselines.map((baseline) => baseline.brierScore))
    return metric.brierScore > bestBaseline + tolerance
  })
  const candidateMeanBrier = mean(metrics.map((metric) => metric.brierScore))
  const championComparable = championMetrics?.filter((metric) => metrics.some((candidate) => candidate.market === metric.market)) ?? []
  const championMeanBrier = championComparable.length > 0
    ? mean(championComparable.map((metric) => metric.brierScore))
    : undefined
  const reasons: string[] = []
  if (worseThanBaseline.length > 0) reasons.push(`Não superou baseline em: ${worseThanBaseline.map((metric) => metric.market).join(', ')}.`)
  if (championMeanBrier !== undefined && candidateMeanBrier > championMeanBrier + tolerance) {
    reasons.push('Challenger apresenta Brier médio pior que o champion além da tolerância.')
  }
  if (reasons.length > 0) {
    return { decision: 'reject', reasons, evaluatedMarkets: metrics.length, candidateMeanBrier, championMeanBrier }
  }
  return {
    decision: 'promote',
    reasons: [championMeanBrier === undefined ? 'Primeiro modelo elegível e superior aos baselines.' : 'Challenger não é pior que o champion e supera os baselines.'],
    evaluatedMarkets: metrics.length,
    candidateMeanBrier,
    championMeanBrier,
  }
}

export function reportPromotion(report: EvaluationReport, champion?: EvaluationReport) {
  return assessPromotion(report.metrics, champion?.metrics)
}

export function computePerformanceDrift(
  current: EvaluationMetric[],
  reference?: EvaluationMetric[],
  tolerance = 0.002,
): PerformanceDriftReport {
  const comparable = current.flatMap((metric) => {
    const previous = reference?.find((item) => item.market === metric.market)
    return previous ? [{ current: metric.brierScore, reference: previous.brierScore }] : []
  })
  if (comparable.length === 0) {
    return {
      status: 'dados_insuficientes',
      comparedMarkets: 0,
      limitations: ['Nao existe champion com mercados comparaveis para medir drift de desempenho.'],
    }
  }
  const currentMeanBrier = round(mean(comparable.map((item) => item.current)), 6)
  const referenceMeanBrier = round(mean(comparable.map((item) => item.reference)), 6)
  const delta = round(currentMeanBrier - referenceMeanBrier, 6)
  return {
    status: delta > tolerance ? 'degraded' : delta < -tolerance ? 'improved' : 'stable',
    comparedMarkets: comparable.length,
    currentMeanBrier,
    referenceMeanBrier,
    delta,
    limitations: ['Compara Brier medio apenas nos mercados presentes no challenger e no champion.'],
  }
}

export function wilsonInterval(successes: number, total: number): ConfidenceInterval {
  if (total <= 0) return { lower: 0, upper: 1, level: 0.95, method: 'wilson' }
  const z = 1.959963984540054
  const p = successes / total
  const denominator = 1 + (z ** 2) / total
  const center = (p + (z ** 2) / (2 * total)) / denominator
  const margin = z * Math.sqrt((p * (1 - p) + (z ** 2) / (4 * total)) / total) / denominator
  return { lower: round(Math.max(0, center - margin), 4), upper: round(Math.min(1, center + margin), 4), level: 0.95, method: 'wilson' }
}

export function bootstrapMeanInterval(values: number[], seed = DEFAULT_MLOPS_SEED): ConfidenceInterval {
  if (values.length === 0) return { lower: 0, upper: 1, level: 0.95, method: 'bootstrap' }
  const random = seededRandom(seed)
  const means: number[] = []
  for (let sample = 0; sample < 500; sample += 1) {
    let sum = 0
    for (let index = 0; index < values.length; index += 1) sum += values[Math.floor(random() * values.length)]
    means.push(sum / values.length)
  }
  means.sort((left, right) => left - right)
  return { lower: round(means[Math.floor(means.length * 0.025)], 4), upper: round(means[Math.floor(means.length * 0.975)], 4), level: 0.95, method: 'bootstrap' }
}

/**
 * Normaliza a data para um instante numérico (aceita ISO e DD/MM/AAAA).
 * Retorna null quando a data está ausente ou é inválida (linha descartada).
 */
function normalizedInstant(record: EngineeredMatchRecord): number | null {
  if (!record.date) return null
  try {
    return new Date(parseSourceDate(record.date)).getTime()
  } catch {
    const fallback = new Date(record.date).getTime()
    return Number.isNaN(fallback) ? null : fallback
  }
}

function partition(records: EngineeredMatchRecord[]): TemporalPartition {
  if (records.length === 0) return { rows: 0, from: '', to: '' }
  const dates = records.map((record) => new Date(record.date!).toISOString().slice(0, 10)).sort()
  return { rows: records.length, from: dates[0], to: dates.at(-1)! }
}

function openRatio(value: number | undefined, fallback: number) {
  const selected = value ?? fallback
  if (!(selected > 0 && selected < 1)) throw new Error('Razão temporal deve estar entre 0 e 1 (exclusivo).')
  return selected
}

function closedRatio(value: number | undefined, fallback: number) {
  const selected = value ?? fallback
  if (!(selected >= 0 && selected < 1)) throw new Error('Razão de validação deve estar em [0, 1).')
  return selected
}

function goalDistribution(records: EngineeredMatchRecord[]) {
  const counts = [0, 0, 0, 0, 0]
  for (const record of records) counts[Math.min(4, Math.max(0, Math.floor(record.totalGoals)))] += 1
  return counts.map((count) => Math.max(0.0001, count / records.length))
}

function missingRate(records: EngineeredMatchRecord[], key: 'totalCorners' | 'totalCards') {
  if (records.length === 0) return 1
  return records.filter((record) => record[key] === undefined).length / records.length
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function mean(values: number[]) {
  return round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), 6)
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
