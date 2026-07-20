import type { FeatureExample } from '../preMatchFeatures.js'
import type { WalkForwardPlan } from '../temporalValidation.js'
import {
  COMPARISON_MARKETS,
  actualOutcomes,
  clampProbability,
  selectionKeys,
  type PredictionResult,
  type PredictiveModel,
} from './types.js'

export function mapExamples(
  records: WalkForwardPlan['folds'][number]['train'],
  exampleByIndex: Map<number, FeatureExample>,
): FeatureExample[] {
  const examples: FeatureExample[] = []
  for (const record of records) {
    const example = exampleByIndex.get(record.index)
    if (example) examples.push(example)
  }
  return examples
}

/** Brier de UMA predição contra o rótulo: média entre mercados da média entre seleções. */
export function scorePrediction(prediction: PredictionResult, example: FeatureExample): { sum: number; count: number } {
  let sum = 0
  let count = 0
  for (const market of COMPARISON_MARKETS) {
    const probabilities = prediction[market]
    if (!probabilities) continue
    const actual = actualOutcomes(market, example.label)
    const keys = selectionKeys(market)
    let brier = 0
    for (const key of keys) brier += (clampProbability(probabilities[key] ?? 0) - (actual[key] ?? 0)) ** 2
    sum += brier / keys.length
    count += 1
  }
  return { sum, count }
}

/** Brier médio de um modelo na VALIDAÇÃO dos folds walk-forward (teste reservado). */
export function meanValidationBrier(
  plan: WalkForwardPlan,
  exampleByIndex: Map<number, FeatureExample>,
  model: PredictiveModel,
): number {
  let sum = 0
  let count = 0
  for (const fold of plan.folds) {
    const train = mapExamples(fold.train, exampleByIndex)
    const validation = mapExamples(fold.validation, exampleByIndex)
    if (train.length === 0 || validation.length === 0) continue
    const trained = model.train(train)
    for (const example of validation) {
      const score = scorePrediction(trained.predict(example), example)
      sum += score.sum
      count += score.count
    }
  }
  return count > 0 ? sum / count : Number.POSITIVE_INFINITY
}

/** Predições de cada componente na validação de cada fold (para aprender pesos do ensemble). */
export interface CollectedPrediction {
  foldIndex: number
  example: FeatureExample
  perModel: PredictionResult[]
}

export function collectFoldPredictions(
  plan: WalkForwardPlan,
  exampleByIndex: Map<number, FeatureExample>,
  models: PredictiveModel[],
): CollectedPrediction[] {
  const collected: CollectedPrediction[] = []
  plan.folds.forEach((fold, foldIndex) => {
    const train = mapExamples(fold.train, exampleByIndex)
    const validation = mapExamples(fold.validation, exampleByIndex)
    if (train.length === 0 || validation.length === 0) return
    const trained = models.map((model) => model.train(train))
    for (const example of validation) {
      collected.push({ foldIndex, example, perModel: trained.map((model) => model.predict(example)) })
    }
  })
  return collected
}
