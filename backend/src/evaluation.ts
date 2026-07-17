import {
  MARKET_IDS,
  type BetIntelModel,
  type BrierDecomposition,
  type CalibrationBin,
  type EngineeredMatchRecord,
  type EvaluationBaseline,
  type EvaluationMetric,
  type EvaluationReport,
  type IgnoredMarket,
  type MarketId,
} from './schemas.js'
import { deriveMarketLabels, marketDefinitions } from './markets.js'
import { predictMarkets } from './prediction.js'
import { DEFAULT_MLOPS_SEED, trainModel } from './training.js'
import {
  assessPromotion,
  bootstrapMeanInterval,
  computeDataDrift,
  computePerformanceDrift,
  evaluationTrace,
  temporalSplit,
  wilsonInterval,
} from './mlops.js'

export interface EvaluationOptions {
  minRows?: number
  validationRatio?: number
  testRatio?: number
  seed?: number
  datasetVersionId?: string
  modelVersionId?: string
  codeVersion?: string
  featureSetVersion?: string
  generatedAt?: string
}

export interface EvaluationObservation {
  row: number
  selection: string
  probability: number
  actual: number
}

export function evaluateModel(
  records: EngineeredMatchRecord[],
  options: EvaluationOptions = {},
): EvaluationReport {
  const seed = options.seed ?? DEFAULT_MLOPS_SEED
  const split = temporalSplit(records, {
    validationRatio: options.validationRatio,
    testRatio: options.testRatio,
  })
  const model = trainModel(split.train, {
    minRows: options.minRows,
    seed,
    codeVersion: options.codeVersion,
    featureSetVersion: options.featureSetVersion,
    generatedAt: options.generatedAt,
  })
  const metrics = evaluatePredictions(model, split.test, split.train, seed)
  const trace = evaluationTrace({
    seed,
    datasetVersionId: options.datasetVersionId,
    modelVersionId: options.modelVersionId,
    codeVersion: options.codeVersion,
    featureSetVersion: options.featureSetVersion,
    hyperparameters: {
      minRows: options.minRows ?? model.minRows,
      validationRatio: options.validationRatio ?? 0,
      testRatio: options.testRatio ?? 0.2,
      splitStrategy: split.report.strategy,
    },
    partitions: split.partitions,
  })

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    trainRows: split.train.length,
    validationRows: split.validation.length,
    testRows: split.test.length,
    partitions: split.partitions,
    split: split.report,
    metrics,
    ignoredMarkets: MARKET_IDS.flatMap((market) => ignoredForModel(model, market)),
    trace,
    drift: computeDataDrift(split.train, split.test),
    performanceDrift: computePerformanceDrift(metrics),
    promotion: assessPromotion(metrics),
  }
}

export function evaluatePredictions(
  model: BetIntelModel,
  records: EngineeredMatchRecord[],
  baselineRecords: EngineeredMatchRecord[] = records,
  seed = DEFAULT_MLOPS_SEED,
): EvaluationMetric[] {
  return MARKET_IDS.map((market) => metricForMarket(model, records, baselineRecords, market, seed)).filter(
    (metric): metric is EvaluationMetric => metric !== null,
  )
}

function metricForMarket(
  model: BetIntelModel,
  records: EngineeredMatchRecord[],
  baselineRecords: EngineeredMatchRecord[],
  market: MarketId,
  seed: number,
): EvaluationMetric | null {
  const observations: EvaluationObservation[] = []
  let eligibleRows = 0
  let categoricalCorrect = 0
  let categoricalTotal = 0

  for (const record of records) {
    const labels = deriveMarketLabels(record, market)
    if (!labels) continue
    eligibleRows += 1
    const prediction = predictMarkets(model, predictionRequest(record)).availableMarkets
      .find((item) => item.market === market)
    if (!prediction) continue

    const rowObservations = prediction.selections.map((selection) => ({
      row: record.index,
      selection: selection.key,
      probability: clampProbability(selection.probability / 100),
      actual: labels.labels[selection.key] ? 1 : 0,
    }))
    observations.push(...rowObservations)

    if (market === '1X2') {
      categoricalTotal += 1
      const predicted = [...rowObservations].sort((left, right) => right.probability - left.probability)[0]
      if (predicted?.actual === 1) categoricalCorrect += 1
    }
  }
  if (observations.length === 0) return null

  return summarizeMarketObservations({
    market,
    observations,
    baselineRecords,
    eligibleRows,
    categoricalCorrect,
    categoricalTotal,
    seed,
  })
}

export function summarizeMarketObservations(input: {
  market: MarketId
  observations: EvaluationObservation[]
  baselineRecords: EngineeredMatchRecord[]
  eligibleRows: number
  categoricalCorrect?: number
  categoricalTotal?: number
  seed?: number
}): EvaluationMetric {
  const definition = marketDefinitions[input.market]
  const errors = input.observations.map((item) => (item.probability - item.actual) ** 2)
  const correctSelections = input.observations.filter((item) => (item.probability >= 0.5 ? 1 : 0) === item.actual).length
  const accuracySuccesses = input.market === '1X2' ? input.categoricalCorrect ?? 0 : correctSelections
  const accuracyTotal = input.market === '1X2' ? input.categoricalTotal ?? 0 : input.observations.length
  const bins = calibrationBins(input.observations)
  return {
    market: input.market,
    displayName: definition.displayName,
    evaluatedRows: input.market === '1X2' ? accuracyTotal : input.observations.length,
    selectionAccuracy: round((accuracySuccesses / Math.max(1, accuracyTotal)) * 100, 1),
    brierScore: round(mean(errors), 4),
    coverage: round((input.observations.length / Math.max(1, input.eligibleRows * definition.selections.length)) * 100, 1),
    logLoss: round(mean(input.observations.map((item) => binaryLogLoss(item.probability, item.actual))), 4),
    baselines: baselineMetrics(input.market, input.baselineRecords, input.observations),
    brierDecomposition: decomposeBrier(input.observations, bins),
    calibration: bins,
    expectedCalibrationError: round(bins.reduce((sum, bin) =>
      sum + (bin.sampleSize / input.observations.length) * Math.abs(bin.meanPredicted - bin.observedRate), 0), 4),
    uncertainty: {
      brierScore: bootstrapMeanInterval(errors, (input.seed ?? DEFAULT_MLOPS_SEED) + input.market.length),
      selectionAccuracy: wilsonInterval(accuracySuccesses, accuracyTotal),
    },
  }
}

function baselineMetrics(
  market: MarketId,
  trainingRows: EngineeredMatchRecord[],
  test: EvaluationObservation[],
): EvaluationBaseline[] {
  const trainingLabels = trainingRows.flatMap((record) => {
    const labels = deriveMarketLabels(record, market)
    return labels
      ? Object.entries(labels.labels).map(([selection, actual]) => ({ selection, actual: actual ? 1 : 0 }))
      : []
  })
  const prevalence = new Map<string, number>()
  for (const selection of marketDefinitions[market].selections) {
    const values = trainingLabels.filter((item) => item.selection === selection.key)
    prevalence.set(selection.key, values.length === 0 ? neutralProbability(market) : mean(values.map((item) => item.actual)))
  }
  return [
    baseline('climatology', test, (selection) => prevalence.get(selection) ?? neutralProbability(market)),
    baseline('uniform', test, () => neutralProbability(market)),
  ]
}

function baseline(
  name: EvaluationBaseline['name'],
  observations: EvaluationObservation[],
  probabilityFor: (selection: string) => number,
): EvaluationBaseline {
  const probabilities = observations.map((item) => clampProbability(probabilityFor(item.selection)))
  return {
    name,
    sampleSize: observations.length,
    brierScore: round(mean(observations.map((item, index) => (probabilities[index] - item.actual) ** 2)), 4),
    logLoss: round(mean(observations.map((item, index) => binaryLogLoss(probabilities[index], item.actual))), 4),
  }
}

function calibrationBins(observations: EvaluationObservation[]): CalibrationBin[] {
  const bins: CalibrationBin[] = []
  for (let index = 0; index < 10; index += 1) {
    const lower = index / 10
    const upper = (index + 1) / 10
    const values = observations.filter((item) =>
      index === 9 ? item.probability >= lower && item.probability <= upper : item.probability >= lower && item.probability < upper,
    )
    if (values.length === 0) continue
    bins.push({
      lower,
      upper,
      meanPredicted: round(mean(values.map((item) => item.probability)), 4),
      observedRate: round(mean(values.map((item) => item.actual)), 4),
      sampleSize: values.length,
    })
  }
  return bins
}

function decomposeBrier(observations: EvaluationObservation[], bins: CalibrationBin[]): BrierDecomposition {
  const overall = mean(observations.map((item) => item.actual))
  const reliability = bins.reduce((sum, bin) => sum + (bin.sampleSize / observations.length) * ((bin.meanPredicted - bin.observedRate) ** 2), 0)
  const resolution = bins.reduce((sum, bin) => sum + (bin.sampleSize / observations.length) * ((bin.observedRate - overall) ** 2), 0)
  const uncertainty = overall * (1 - overall)
  return {
    reliability: round(reliability, 4),
    resolution: round(resolution, 4),
    uncertainty: round(uncertainty, 4),
    recomposed: round(reliability - resolution + uncertainty, 4),
  }
}

function ignoredForModel(model: BetIntelModel, market: MarketId): IgnoredMarket[] {
  const marketModel = model.markets[market]
  const definition = marketDefinitions[market]
  if (marketModel.status === 'available') return []
  return [{
    market,
    displayName: definition.displayName,
    status: 'dados_insuficientes',
    reason: marketModel.reason ?? 'Mercado sem dados suficientes.',
    requiredColumns: definition.requiredColumns,
    optionalColumns: definition.optionalColumns,
  }]
}

function predictionRequest(record: EngineeredMatchRecord) {
  return {
    homeTeam: record.homeTeam ?? '', awayTeam: record.awayTeam ?? '', league: record.league,
    competition: record.competition, season: record.season, date: record.date,
  }
}

function neutralProbability(market: MarketId) {
  if (market === '1X2') return 1 / 3
  if (market === 'DOUBLE_CHANCE') return 2 / 3
  return 0.5
}

function binaryLogLoss(probability: number, actual: number) {
  return -(actual * Math.log(probability) + (1 - actual) * Math.log(1 - probability))
}

function clampProbability(value: number) {
  return Math.max(0.000001, Math.min(0.999999, value))
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
