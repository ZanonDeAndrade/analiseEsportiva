import { MARKET_IDS, type EngineeredMatchRecord, type EvaluationMetric, type EvaluationReport, type IgnoredMarket, type MarketId } from './schemas.js'
import { deriveMarketLabels, marketDefinitions } from './markets.js'
import { predictMarkets } from './prediction.js'
import { trainModel } from './training.js'

export interface EvaluationOptions {
  minRows?: number
  testRatio?: number
}

export function evaluateModel(
  records: EngineeredMatchRecord[],
  options: EvaluationOptions = {},
): EvaluationReport {
  const testRatio = options.testRatio ?? 0.2
  const splitIndex = Math.max(1, Math.floor(records.length * (1 - testRatio)))
  const trainRows = records.slice(0, splitIndex)
  const testRows = records.slice(splitIndex)
  const model = trainModel(trainRows, { minRows: options.minRows })

  return {
    generatedAt: new Date().toISOString(),
    trainRows: trainRows.length,
    testRows: testRows.length,
    metrics: evaluatePredictions(model, testRows),
    ignoredMarkets: MARKET_IDS.flatMap((market) => ignoredForModel(model, market)),
  }
}

export function evaluatePredictions(
  model: ReturnType<typeof trainModel>,
  records: EngineeredMatchRecord[],
): EvaluationMetric[] {
  return MARKET_IDS.map((market) => metricForMarket(model, records, market)).filter(
    (metric): metric is EvaluationMetric => metric !== null,
  )
}

function metricForMarket(
  model: ReturnType<typeof trainModel>,
  records: EngineeredMatchRecord[],
  market: MarketId,
): EvaluationMetric | null {
  const definition = marketDefinitions[market]
  let comparisons = 0
  let correct = 0
  let brierSum = 0

  for (const record of records) {
    const labels = deriveMarketLabels(record, market)
    if (!labels) continue

    const prediction = predictMarkets(model, {
      homeTeam: record.homeTeam ?? '',
      awayTeam: record.awayTeam ?? '',
      league: record.league,
      season: record.season,
      date: record.date,
    }).availableMarkets.find((item) => item.market === market)

    if (!prediction) continue

    for (const selection of prediction.selections) {
      const actual = labels.labels[selection.key] ? 1 : 0
      const predictedProbability = selection.probability / 100
      const predictedClass = predictedProbability >= 0.5 ? 1 : 0

      comparisons += 1
      if (predictedClass === actual) correct += 1
      brierSum += (predictedProbability - actual) ** 2
    }
  }

  if (comparisons === 0) return null

  return {
    market,
    displayName: definition.displayName,
    evaluatedRows: comparisons,
    selectionAccuracy: Math.round((correct / comparisons) * 1000) / 10,
    brierScore: Math.round((brierSum / comparisons) * 10000) / 10000,
    coverage: Math.round((comparisons / Math.max(1, records.length * definition.selections.length)) * 1000) / 10,
  }
}

function ignoredForModel(model: ReturnType<typeof trainModel>, market: MarketId): IgnoredMarket[] {
  const marketModel = model.markets[market]
  const definition = marketDefinitions[market]

  if (marketModel.status === 'available') return []

  return [
    {
      market,
      displayName: definition.displayName,
      status: 'dados_insuficientes',
      reason: marketModel.reason ?? 'Mercado sem dados suficientes.',
      requiredColumns: definition.requiredColumns,
      optionalColumns: definition.optionalColumns,
    },
  ]
}
