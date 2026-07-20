import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds } from '../temporalValidation.js'
import { combineCoherent, evaluateEnsemble, learnEnsembleWeights } from './ensemble.js'
import { collectFoldPredictions } from './foldScoring.js'
import { tuneGradientBoosting } from './hyperparameterSearch.js'
import { createGradientBoostingModel } from './gradientBoosting.js'
import { dixonColesModel } from './poisson.js'
import { logisticModel } from './logistic.js'
import { fitVectorizer } from './tabularFeatures.js'

function scenario() {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta']
  const lines: string[] = []
  let day = 0
  for (const season of ['2021', '2022', '2023']) {
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(Date.UTC(2021, 0, 1) + day * 86_400_000).toISOString().slice(0, 10)
      lines.push(`Liga,L,${season},${date},${teams[i % 4]},${teams[(i + 1) % 4]},${(i + season.length) % 4},${i % 3},test`)
      day += 1
    }
  }
  const records = assessDataQuality(parseCsv([header, ...lines].join('\n'))).records
  const examples = generateSequentialFeatures(records)
  return { examples, exampleByIndex: new Map(examples.map((e) => [e.index, e])), plan: walkForwardFolds(temporalThreeWaySplit(records).development) }
}

test('ETAPA 8: vetorização trata missing com imputação + indicador (não confunde com zero)', () => {
  const { examples } = scenario()
  const vectorizer = fitVectorizer(examples)
  const half = vectorizer.featureNames.length / 2
  // A primeira partida (sem histórico) deve ter indicadores de ausência marcados.
  const firstVector = vectorizer.transform(examples[0])
  const missingFlags = firstVector.slice(half)
  assert.ok(missingFlags.some((flag) => flag === 1), 'esperava ao menos um indicador de ausência')
  // Todos os valores são finitos (imputados), nunca NaN.
  assert.ok(firstVector.every((value) => Number.isFinite(value)))
})

test('ETAPA 8: busca de hiperparâmetros registra todas as configs e escolhe a de menor Brier', () => {
  const { plan, exampleByIndex } = scenario()
  const grid = [
    { rounds: 15, learningRate: 0.15, maxDepth: 2, lambda: 1, minChild: 10, maxThresholds: 12 },
    { rounds: 15, learningRate: 0.05, maxDepth: 3, lambda: 3, minChild: 10, maxThresholds: 12 },
  ]
  const tuning = tuneGradientBoosting(plan, exampleByIndex, grid)
  assert.equal(tuning.log.length, grid.length)
  assert.ok(tuning.bestBrier <= tuning.log[0].meanValidationBrier)
  assert.ok(tuning.bestBrier <= tuning.log[1].meanValidationBrier)
  void createGradientBoostingModel(tuning.best)
})

test('ETAPA 9: combineCoherent produz mercados coerentes', () => {
  const { plan, exampleByIndex } = scenario()
  const collected = collectFoldPredictions(plan, exampleByIndex, [dixonColesModel, logisticModel])
  const item = collected[0]
  const combined = combineCoherent(item.perModel, [0.5, 0.5])
  const x2 = combined['1X2']!
  assert.ok(Math.abs(x2.home_win + x2.draw + x2.away_win - 1) < 1e-4)
  assert.ok(Math.abs(combined.UNDER_2_5_GOALS!.under_2_5 - (1 - combined.OVER_2_5_GOALS!.over_2_5)) < 1e-5)
  assert.ok(combined.OVER_1_5_GOALS!.over_1_5 >= combined.OVER_2_5_GOALS!.over_2_5 - 1e-9)
})

test('ETAPA 9: pesos do ensemble somam 1 e a avaliação compara com cada componente', () => {
  const { plan, exampleByIndex } = scenario()
  const components = [dixonColesModel, logisticModel]
  const result = evaluateEnsemble(plan, exampleByIndex, components)
  assert.ok(Math.abs(result.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9)
  assert.equal(result.componentBriers.length, components.length)
  assert.equal(typeof result.promoted, 'boolean')
  // pesos aprendidos e avaliados em folds distintos quando há >1 fold.
  if (plan.folds.length > 1) {
    assert.ok(!result.learnedOnFolds.includes(result.evaluatedOnFolds[0]))
  }
})

test('ETAPA 9: exige ao menos dois componentes', () => {
  const { plan, exampleByIndex } = scenario()
  assert.throws(() => evaluateEnsemble(plan, exampleByIndex, [dixonColesModel]))
})

test('learnEnsembleWeights é determinístico', () => {
  const { plan, exampleByIndex } = scenario()
  const collected = collectFoldPredictions(plan, exampleByIndex, [dixonColesModel, logisticModel])
  assert.deepEqual(learnEnsembleWeights(collected, 2), learnEnsembleWeights(collected, 2))
})
