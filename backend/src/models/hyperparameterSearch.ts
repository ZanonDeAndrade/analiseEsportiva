import type { FeatureExample } from '../preMatchFeatures.js'
import type { WalkForwardPlan } from '../temporalValidation.js'
import { meanValidationBrier } from './foldScoring.js'
import { createGradientBoostingModel, DEFAULT_GBM_CONFIG, type GradientBoostingConfig } from './gradientBoosting.js'

export interface TuningResult<Config> {
  best: Config
  bestBrier: number
  log: Array<{ config: Config; meanValidationBrier: number }>
}

/**
 * ETAPA 8 — Busca de hiperparâmetros do gradient boosting feita SOMENTE nos folds
 * de validação temporal (o teste final permanece reservado). Todas as
 * configurações testadas são registradas no log.
 */
export function tuneGradientBoosting(
  plan: WalkForwardPlan,
  exampleByIndex: Map<number, FeatureExample>,
  grid: GradientBoostingConfig[] = defaultGrid(),
): TuningResult<GradientBoostingConfig> {
  const log = grid.map((config) => ({
    config,
    meanValidationBrier: meanValidationBrier(plan, exampleByIndex, createGradientBoostingModel(config)),
  }))
  const best = [...log].sort((left, right) => left.meanValidationBrier - right.meanValidationBrier)[0]
  return { best: best.config, bestBrier: best.meanValidationBrier, log }
}

/** Grade pequena e explícita de regularização/profundidade/taxa de aprendizado. */
export function defaultGrid(): GradientBoostingConfig[] {
  const grid: GradientBoostingConfig[] = []
  for (const maxDepth of [2, 3]) {
    for (const learningRate of [0.05, 0.15]) {
      for (const lambda of [1, 3]) {
        grid.push({ ...DEFAULT_GBM_CONFIG, maxDepth, learningRate, lambda, rounds: learningRate < 0.1 ? 40 : 25 })
      }
    }
  }
  return grid
}
