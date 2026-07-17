import type { BacktestReport, EngineeredMatchRecord, MarketId } from './schemas.js'
import { deriveMarketLabels } from './markets.js'
import { MARKET_IDS } from './schemas.js'
import { predictMarkets } from './prediction.js'
import { DEFAULT_MLOPS_SEED, trainModel } from './training.js'
import {
  summarizeMarketObservations,
  type EvaluationObservation,
} from './evaluation.js'
import { computeDataDrift, evaluationTrace, temporalSplit, TemporalLeakageError } from './mlops.js'

export interface BacktestOptions {
  minRows?: number
  initialWindow?: number
  seed?: number
  datasetVersionId?: string
  modelVersionId?: string
  codeVersion?: string
  generatedAt?: string
}

export function runBacktest(
  records: EngineeredMatchRecord[],
  options: BacktestOptions = {},
): BacktestReport {
  const ordered = [...records].sort((left, right) => instant(left) - instant(right) || left.index - right.index)
  const split = temporalSplit(ordered)
  const initialWindow = options.initialWindow ?? Math.max(options.minRows ?? 20, 20)
  const observations = new Map<MarketId, EvaluationObservation[]>()
  const eligibleRows = new Map<MarketId, number>()
  const categorical = new Map<MarketId, { correct: number; total: number }>()
  let ignoredPredictions = 0
  let evaluatedRows = 0

  for (const target of ordered) {
    const trainRows = ordered.filter((candidate) => instant(candidate) < instant(target))
    if (trainRows.length < initialWindow) continue
    if (trainRows.some((candidate) => instant(candidate) >= instant(target))) {
      throw new TemporalLeakageError('Backtest tentou treinar com registro simultâneo ou posterior ao alvo.')
    }
    evaluatedRows += 1
    const model = trainModel(trainRows, {
      minRows: options.minRows,
      seed: options.seed,
      codeVersion: options.codeVersion,
      generatedAt: options.generatedAt,
    })
    const response = predictMarkets(model, requestFor(target))
    ignoredPredictions += response.ignoredMarkets.length

    for (const market of MARKET_IDS) {
      const labels = deriveMarketLabels(target, market)
      if (!labels) continue
      eligibleRows.set(market, (eligibleRows.get(market) ?? 0) + 1)
      const prediction = response.availableMarkets.find((item) => item.market === market)
      if (!prediction) continue
      const row = prediction.selections.map((selection) => ({
        row: target.index,
        selection: selection.key,
        probability: Math.max(0.000001, Math.min(0.999999, selection.probability / 100)),
        actual: labels.labels[selection.key] ? 1 : 0,
      }))
      observations.set(market, [...(observations.get(market) ?? []), ...row])
      if (market === '1X2') {
        const counter = categorical.get(market) ?? { correct: 0, total: 0 }
        counter.total += 1
        if ([...row].sort((left, right) => right.probability - left.probability)[0]?.actual === 1) counter.correct += 1
        categorical.set(market, counter)
      }
    }
  }

  const baselineRows = ordered.slice(0, Math.min(initialWindow, ordered.length))
  const metrics = MARKET_IDS.flatMap((market) => {
    const values = observations.get(market)
    if (!values?.length) return []
    const category = categorical.get(market)
    return [summarizeMarketObservations({
      market,
      observations: values,
      baselineRecords: baselineRows,
      eligibleRows: eligibleRows.get(market) ?? 0,
      categoricalCorrect: category?.correct,
      categoricalTotal: category?.total,
      seed: options.seed,
    })]
  })
  const trace = evaluationTrace({
    seed: options.seed ?? DEFAULT_MLOPS_SEED,
    datasetVersionId: options.datasetVersionId,
    modelVersionId: options.modelVersionId,
    codeVersion: options.codeVersion,
    hyperparameters: { minRows: options.minRows ?? 20, initialWindow },
    partitions: split.partitions,
  })

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    initialWindow,
    evaluatedRows,
    metrics,
    ignoredPredictions,
    period: { from: ordered[0]?.date ?? 'unknown', to: ordered.at(-1)?.date ?? 'unknown' },
    trace,
    drift: computeDataDrift(split.train, split.test),
  }
}

function instant(record: EngineeredMatchRecord) {
  if (!record.date) throw new TemporalLeakageError(`Linha ${record.index} sem data no backtest.`)
  const value = new Date(record.date).getTime()
  if (Number.isNaN(value)) throw new TemporalLeakageError(`Linha ${record.index} com data inválida no backtest.`)
  return value
}

function requestFor(record: EngineeredMatchRecord) {
  return {
    homeTeam: record.homeTeam ?? '', awayTeam: record.awayTeam ?? '', league: record.league,
    competition: record.competition, season: record.season, date: record.date,
  }
}
