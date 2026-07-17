import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFeatureTable } from './featureEngineering.js'
import { evaluateModel, evaluatePredictions } from './evaluation.js'
import { assessPromotion, computePerformanceDrift, temporalSplit } from './mlops.js'
import { predictMarkets } from './prediction.js'
import { trainModel } from './training.js'
import type { CsvRow, EvaluationMetric } from './schemas.js'

test('divisão temporal por competição mantém treino antes do teste e sem sobreposição', () => {
  const records = features(10)
  const split = temporalSplit(records)
  assert.equal(split.report.strategy, 'per_competition_temporal')
  assert.ok(split.partitions.train.to < split.partitions.test.from)
  const trainIndices = new Set(split.train.map((record) => record.index))
  assert.ok(split.test.every((record) => !trainIndices.has(record.index)))
  // Datas idênticas não quebram o split (divisão por contagem, não por dia).
  const sameDay = temporalSplit(records.map((record) => ({ ...record, date: '2026-01-01' })))
  const sameDayTrain = new Set(sameDay.train.map((record) => record.index))
  assert.equal(sameDay.report.discardedRows, 0)
  assert.ok(sameDay.test.length >= 1)
  assert.ok(sameDay.test.every((record) => !sameDayTrain.has(record.index)))
})

test('mesma seed, artefatos e instante reproduzem exatamente a avaliação', () => {
  const options = { minRows: 1, seed: 77, generatedAt: '2026-07-15T12:00:00.000Z', codeVersion: 'commit-test' }
  const first = evaluateModel(features(15), options)
  const second = evaluateModel(features(15), options)
  assert.deepEqual(second, first)
  assert.equal(first.trace.seed, 77)
  assert.equal(first.trace.codeVersion, 'commit-test')
})

test('toda métrica publicada contém baselines obrigatórias e amostra', () => {
  const report = evaluateModel(features(15), { minRows: 1, seed: 2026 })
  assert.ok(report.metrics.length > 0)
  assert.ok(report.metrics.every((metric) => metric.baselines.length >= 2))
  assert.ok(report.metrics.every((metric) => metric.baselines.every((baseline) => baseline.sampleSize > 0)))
  assert.ok(report.metrics.every((metric) => metric.evaluatedRows > 0))
})

test('calibração conhecida de 50% produz ECE zero no mercado binário', () => {
  const training = buildFeatureTable([
    row(1, '2026-01-01', 3, 0),
    row(2, '2026-01-02', 1, 0),
    row(3, '2026-01-03', 4, 0),
    row(4, '2026-01-04', 0, 0),
  ]).records
  const testRows = buildFeatureTable([
    row(5, '2026-01-05', 3, 0),
    row(6, '2026-01-06', 1, 0),
  ]).records
  const model = trainModel(training, { minRows: 1, generatedAt: '2026-01-07T00:00:00Z' })
  const metric = evaluatePredictions(model, testRows, training)
    .find((item) => item.market === 'OVER_2_5_GOALS')
  assert.equal(metric?.expectedCalibrationError, 0)
  assert.deepEqual(metric?.calibration, [{
    lower: 0.5, upper: 0.6, meanPredicted: 0.5, observedRate: 0.5, sampleSize: 4,
  }])
})

test('promoção rejeita challenger pior e nunca promove métrica sem baseline', () => {
  const candidate = metric(0.3, 0.25)
  const champion = metric(0.2, 0.25)
  assert.equal(assessPromotion([candidate], [champion]).decision, 'reject')
  assert.equal(assessPromotion([{ ...candidate, baselines: [] }]).decision, 'reject')
  assert.equal(assessPromotion([metric(0.15, 0.25)], [champion]).decision, 'promote')
  assert.equal(computePerformanceDrift([candidate], [champion]).status, 'degraded')
})

test('dados_insuficientes permanece resposta legítima com limitações', () => {
  const model = trainModel(features(2), { minRows: 20 })
  const response = predictMarkets(model, { homeTeam: 'A', awayTeam: 'B', league: 'Teste' })
  assert.equal(response.availableMarkets.length, 0)
  assert.ok(response.ignoredMarkets.every((market) => market.status === 'dados_insuficientes'))
  assert.ok(response.limitations.length > 0)
})

test('API de predicao expoe linhagem, periodo, amostra, incerteza e limitacoes', () => {
  const model = trainModel(features(12), { minRows: 1, codeVersion: 'commit-api' }) as ReturnType<typeof trainModel> & {
    modelVersionId: string
    datasetVersionId: string
  }
  model.modelVersionId = 'model-v1'
  model.datasetVersionId = 'dataset-v1'
  const response = predictMarkets(model, { homeTeam: 'Casa 1', awayTeam: 'Fora 2', league: 'Teste' })
  assert.equal(response.modelVersion, 'model-v1')
  assert.equal(response.datasetVersion, 'dataset-v1')
  assert.equal(response.codeVersion, 'commit-api')
  assert.ok(response.period)
  assert.ok(response.limitations.length > 0)
  assert.ok(response.availableMarkets.length > 0)
  assert.ok(response.availableMarkets.every((market) => market.sourceSegment && market.sampleSize > 0 && market.period))
  assert.ok(response.availableMarkets.every((market) => market.selections.every((selection) => selection.uncertainty.level === 0.95)))
})

function features(count: number) {
  return buildFeatureTable(Array.from({ length: count }, (_, index) =>
    row(index, `2026-01-${String(index + 1).padStart(2, '0')}`, index % 4, index % 2),
  )).records
}

function row(index: number, date: string, homeGoals: number, awayGoals: number): CsvRow {
  return {
    Div: 'T', League: 'Teste', Competition: 'Teste', Season: '2026', Date: date,
    HomeTeam: `Casa ${index}`, AwayTeam: `Fora ${index}`,
    FTHG: String(homeGoals), FTAG: String(awayGoals), SourceProvider: 'test', UpdatedAt: `${date}T23:00:00Z`,
  }
}

function metric(brierScore: number, baselineBrier: number) {
  return {
    market: '1X2',
    brierScore,
    baselines: [{ name: 'uniform', brierScore: baselineBrier, logLoss: 0.7, sampleSize: 10 }],
  } as EvaluationMetric
}
