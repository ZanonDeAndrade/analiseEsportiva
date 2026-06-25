import type { BacktestReport, EngineeredMatchRecord, EvaluationMetric } from './schemas.js'
import { deriveMarketLabels, marketDefinitions } from './markets.js'
import { MARKET_IDS } from './schemas.js'
import { predictMarkets } from './prediction.js'
import { trainModel } from './training.js'

export interface BacktestOptions {
  minRows?: number
  initialWindow?: number
}

export function runBacktest(
  records: EngineeredMatchRecord[],
  options: BacktestOptions = {},
): BacktestReport {
  const ordered = [...records].sort((left, right) => {
    if (left.date && right.date && left.date !== right.date) return left.date.localeCompare(right.date)
    return left.index - right.index
  })
  const initialWindow = options.initialWindow ?? Math.max(options.minRows ?? 20, 20)
  const counters = new Map<string, { correct: number; total: number; brier: number }>()
  let ignoredPredictions = 0

  for (let index = initialWindow; index < ordered.length; index += 1) {
    const trainRows = ordered.slice(0, index)
    const target = ordered[index]
    const model = trainModel(trainRows, { minRows: options.minRows })
    const response = predictMarkets(model, {
      homeTeam: target.homeTeam ?? '',
      awayTeam: target.awayTeam ?? '',
      league: target.league,
      season: target.season,
      date: target.date,
    })

    ignoredPredictions += response.ignoredMarkets.length

    for (const market of response.availableMarkets) {
      const labels = deriveMarketLabels(target, market.market)
      if (!labels) continue

      const counter = counters.get(market.market) ?? { correct: 0, total: 0, brier: 0 }

      for (const selection of market.selections) {
        const actual = labels.labels[selection.key] ? 1 : 0
        const probability = selection.probability / 100
        const predictedClass = probability >= 0.5 ? 1 : 0

        counter.total += 1
        if (actual === predictedClass) counter.correct += 1
        counter.brier += (probability - actual) ** 2
      }

      counters.set(market.market, counter)
    }
  }

  const metrics: EvaluationMetric[] = MARKET_IDS.flatMap((market) => {
    const counter = counters.get(market)
    if (!counter || counter.total === 0) return []

    return [
      {
        market,
        displayName: marketDefinitions[market].displayName,
        evaluatedRows: counter.total,
        selectionAccuracy: Math.round((counter.correct / counter.total) * 1000) / 10,
        brierScore: Math.round((counter.brier / counter.total) * 10000) / 10000,
        coverage:
          Math.round(
            (counter.total /
              Math.max(1, Math.max(0, ordered.length - initialWindow) * marketDefinitions[market].selections.length)) *
              1000,
          ) / 10,
      },
    ]
  })

  return {
    generatedAt: new Date().toISOString(),
    initialWindow,
    evaluatedRows: Math.max(0, ordered.length - initialWindow),
    metrics,
    ignoredPredictions,
  }
}
