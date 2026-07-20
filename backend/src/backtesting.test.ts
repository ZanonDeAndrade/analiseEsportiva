import assert from 'node:assert/strict'
import test from 'node:test'
import { runBacktest } from './backtesting.js'
import { parseCsv } from './csv.js'
import { assessDataQuality } from './dataQuality.js'
import { deriveMarketLabels } from './markets.js'
import { predictMarkets } from './prediction.js'
import { summarizeMarketObservations, type EvaluationObservation } from './evaluation.js'
import { computeDataDrift, evaluationTrace, temporalSplit } from './mlops.js'
import { DEFAULT_MLOPS_SEED, trainModel } from './training.js'
import { MARKET_IDS, type BacktestReport, type EngineeredMatchRecord, type MarketId } from './schemas.js'

function dataset(count: number): EngineeredMatchRecord[] {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta']
  const base = Date.UTC(2024, 0, 1)
  const lines: string[] = []
  for (let i = 0; i < count; i += 1) {
    const date = new Date(base + i * 86_400_000).toISOString().slice(0, 10)
    lines.push(`Liga,L,2024,${date},${teams[i % 6]},${teams[(i + 1) % 6]},${i % 4},${(i + 1) % 3},test`)
  }
  return assessDataQuality(parseCsv([header, ...lines].join('\n'))).records
}

/** Implementação de REFERÊNCIA (retreino O(n²)): só existe nos testes. */
function referenceBacktest(records: EngineeredMatchRecord[], options: { minRows: number; initialWindow: number; generatedAt: string }): Omit<BacktestReport, 'durationMs'> {
  const instant = (record: EngineeredMatchRecord) => new Date(record.date!).getTime()
  const ordered = [...records].sort((left, right) => instant(left) - instant(right) || left.index - right.index)
  const split = temporalSplit(ordered)
  const observations = new Map<MarketId, EvaluationObservation[]>()
  const eligibleRows = new Map<MarketId, number>()
  const categorical = new Map<MarketId, { correct: number; total: number }>()
  let ignoredPredictions = 0
  let evaluatedRows = 0

  for (const target of ordered) {
    const trainRows = ordered.filter((candidate) => instant(candidate) < instant(target))
    if (trainRows.length < options.initialWindow) continue
    evaluatedRows += 1
    const model = trainModel(trainRows, { minRows: options.minRows, generatedAt: options.generatedAt })
    const response = predictMarkets(model, { homeTeam: target.homeTeam ?? '', awayTeam: target.awayTeam ?? '', league: target.league, competition: target.competition, season: target.season, date: target.date })
    ignoredPredictions += response.ignoredMarkets.length
    for (const market of MARKET_IDS) {
      const labels = deriveMarketLabels(target, market)
      if (!labels) continue
      eligibleRows.set(market, (eligibleRows.get(market) ?? 0) + 1)
      const prediction = response.availableMarkets.find((item) => item.market === market)
      if (!prediction) continue
      const row = prediction.selections.map((selection) => ({ row: target.index, selection: selection.key, probability: Math.max(0.000001, Math.min(0.999999, selection.probability / 100)), actual: labels.labels[selection.key] ? 1 : 0 }))
      observations.set(market, [...(observations.get(market) ?? []), ...row])
      if (market === '1X2') {
        const counter = categorical.get(market) ?? { correct: 0, total: 0 }
        counter.total += 1
        if ([...row].sort((left, right) => right.probability - left.probability)[0]?.actual === 1) counter.correct += 1
        categorical.set(market, counter)
      }
    }
  }

  const baselineRows = ordered.slice(0, Math.min(options.initialWindow, ordered.length))
  const metrics = MARKET_IDS.flatMap((market) => {
    const values = observations.get(market)
    if (!values?.length) return []
    const category = categorical.get(market)
    return [summarizeMarketObservations({ market, observations: values, baselineRecords: baselineRows, eligibleRows: eligibleRows.get(market) ?? 0, categoricalCorrect: category?.correct, categoricalTotal: category?.total })]
  })
  const trace = evaluationTrace({ seed: DEFAULT_MLOPS_SEED, hyperparameters: { minRows: options.minRows, initialWindow: options.initialWindow }, partitions: split.partitions })
  return { generatedAt: options.generatedAt, initialWindow: options.initialWindow, evaluatedRows, metrics, ignoredPredictions, period: { from: ordered[0]?.date ?? 'unknown', to: ordered.at(-1)?.date ?? 'unknown' }, trace, drift: computeDataDrift(split.train, split.test) }
}

test('ETAPA 16: backtest incremental é equivalente ao retreino de referência', () => {
  const records = dataset(50)
  const options = { minRows: 5, initialWindow: 8, generatedAt: '2026-07-20T00:00:00.000Z' }
  const incremental = runBacktest(records, options)
  const reference = referenceBacktest(records, options)

  const { durationMs, ...withoutDuration } = incremental
  assert.ok(typeof durationMs === 'number')
  assert.deepEqual(withoutDuration, reference)
})

test('backtest incremental é determinístico e reporta duração', () => {
  const records = dataset(40)
  const options = { minRows: 5, initialWindow: 8, generatedAt: '2026-07-20T00:00:00.000Z' }
  const a = runBacktest(records, options)
  const b = runBacktest(records, options)
  const stripDuration = (report: BacktestReport) => ({ ...report, durationMs: 0 })
  assert.deepEqual(stripDuration(a), stripDuration(b))
  assert.ok(a.evaluatedRows > 0)
  assert.ok(Number.isFinite(a.durationMs))
})
