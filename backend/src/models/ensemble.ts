import type { FeatureExample } from '../preMatchFeatures.js'
import type { WalkForwardPlan } from '../temporalValidation.js'
import { collectFoldPredictions, scorePrediction, type CollectedPrediction } from './foldScoring.js'
import {
  COMPARISON_MARKETS,
  clampProbability,
  selectionKeys,
  type PredictionResult,
  type PredictiveModel,
} from './types.js'

export interface EnsembleEvaluation {
  components: string[]
  weights: number[]
  learnedOnFolds: number[]
  evaluatedOnFolds: number[]
  ensembleBrier: number
  componentBriers: Array<{ name: string; brier: number }>
  promoted: boolean
  note: string
}

/**
 * ETAPA 9 — Combinação coerente de mercados a partir das predições dos componentes,
 * com pesos que somam 1. A coerência estrutural é reimposta após a média ponderada:
 * 1X2 soma 1, dupla chance deriva do 1X2, Under é o complemento do Over.
 */
export function combineCoherent(results: PredictionResult[], weights: number[]): PredictionResult {
  const averaged: Record<string, Record<string, number>> = {}
  for (const market of COMPARISON_MARKETS) {
    const keys = selectionKeys(market)
    const values: Record<string, number> = {}
    let present = false
    for (const key of keys) {
      let weighted = 0
      let weightSum = 0
      results.forEach((result, index) => {
        const probability = result[market]?.[key]
        if (probability !== undefined) {
          weighted += weights[index] * probability
          weightSum += weights[index]
          present = true
        }
      })
      values[key] = weightSum > 0 ? weighted / weightSum : 0
    }
    if (present) averaged[market] = values
  }
  return enforceCoherence(averaged)
}

function enforceCoherence(averaged: Record<string, Record<string, number>>): PredictionResult {
  const result: PredictionResult = {}
  const x2 = averaged['1X2']
  if (x2) {
    const total = (x2.home_win ?? 0) + (x2.draw ?? 0) + (x2.away_win ?? 0) || 1
    const home = clampProbability((x2.home_win ?? 0) / total)
    const draw = clampProbability((x2.draw ?? 0) / total)
    const away = clampProbability(1 - home - draw)
    result['1X2'] = { home_win: home, draw, away_win: away }
    result.DOUBLE_CHANCE = {
      '1x': clampProbability(home + draw),
      '12': clampProbability(home + away),
      x2: clampProbability(draw + away),
    }
  }
  bindComplement(result, averaged, 'OVER_1_5_GOALS', 'over_1_5', 'under_or_equal_1_5')
  const over25 = bindComplement(result, averaged, 'OVER_2_5_GOALS', 'over_2_5', 'under_or_equal_2_5')
  const over35 = bindComplement(result, averaged, 'OVER_3_5_GOALS', 'over_3_5', 'under_or_equal_3_5')
  bindComplement(result, averaged, 'BOTH_TEAMS_SCORE', 'btts_yes', 'btts_no')
  if (over25 !== null) result.UNDER_2_5_GOALS = { under_2_5: clampProbability(1 - over25), over_or_equal_2_5: clampProbability(over25) }
  if (over35 !== null) result.UNDER_3_5_GOALS = { under_3_5: clampProbability(1 - over35), over_or_equal_3_5: clampProbability(over35) }
  return result
}

function bindComplement(result: PredictionResult, averaged: Record<string, Record<string, number>>, market: string, positive: string, negative: string): number | null {
  const values = averaged[market]
  if (!values) return null
  const probability = clampProbability(values[positive] ?? 0)
  ;(result as Record<string, Record<string, number>>)[market] = { [positive]: probability, [negative]: clampProbability(1 - probability) }
  return probability
}

/** Aprende pesos (grade no simplex) minimizando o Brier na validação informada. */
export function learnEnsembleWeights(pooled: CollectedPrediction[], componentCount: number, step = 0.1): number[] {
  let bestWeights = uniformWeights(componentCount)
  let bestBrier = Number.POSITIVE_INFINITY
  for (const weights of simplexGrid(componentCount, step)) {
    let sum = 0
    let count = 0
    for (const item of pooled) {
      const score = scorePrediction(combineCoherent(item.perModel, weights), item.example)
      sum += score.sum
      count += score.count
    }
    const brier = count > 0 ? sum / count : Number.POSITIVE_INFINITY
    if (brier < bestBrier) {
      bestBrier = brier
      bestWeights = weights
    }
  }
  return bestWeights
}

/**
 * Aprende os pesos nos folds de validação mais antigos e avalia o ensemble no
 * fold de validação mais recente (sem tocar no teste final). O ensemble só é
 * marcado como promovível se superar TODOS os componentes na avaliação.
 */
export function evaluateEnsemble(
  plan: WalkForwardPlan,
  exampleByIndex: Map<number, FeatureExample>,
  components: PredictiveModel[],
): EnsembleEvaluation {
  if (components.length < 2) throw new Error('Ensemble exige ao menos dois componentes avaliados isoladamente.')
  const collected = collectFoldPredictions(plan, exampleByIndex, components)
  const foldIndices = [...new Set(collected.map((item) => item.foldIndex))].sort((a, b) => a - b)
  const evalFold = foldIndices.at(-1)!
  const learningFolds = foldIndices.filter((fold) => fold !== evalFold)

  const learningSet = collected.filter((item) => (learningFolds.length > 0 ? learningFolds.includes(item.foldIndex) : true))
  const evaluationSet = collected.filter((item) => item.foldIndex === evalFold)

  const weights = learnEnsembleWeights(learningSet, components.length)

  const ensembleBrier = meanBrier(evaluationSet.map((item) => ({ prediction: combineCoherent(item.perModel, weights), example: item.example })))
  const componentBriers = components.map((model, index) => ({
    name: model.metadata().name,
    brier: meanBrier(evaluationSet.map((item) => ({ prediction: item.perModel[index], example: item.example }))),
  }))
  const promoted = componentBriers.every((component) => ensembleBrier < component.brier)

  return {
    components: components.map((model) => model.metadata().name),
    weights,
    learnedOnFolds: learningFolds.length > 0 ? learningFolds : foldIndices,
    evaluatedOnFolds: [evalFold],
    ensembleBrier: round(ensembleBrier),
    componentBriers: componentBriers.map((component) => ({ name: component.name, brier: round(component.brier) })),
    promoted,
    note: 'Pesos aprendidos nos folds de validação anteriores; ensemble avaliado no fold de validação mais recente. O teste final permanece reservado. Promoção exige superar TODOS os componentes.',
  }
}

function meanBrier(items: Array<{ prediction: PredictionResult; example: FeatureExample }>): number {
  let sum = 0
  let count = 0
  for (const item of items) {
    const score = scorePrediction(item.prediction, item.example)
    sum += score.sum
    count += score.count
  }
  return count > 0 ? sum / count : Number.POSITIVE_INFINITY
}

function uniformWeights(count: number): number[] {
  return new Array(count).fill(1 / count)
}

function simplexGrid(count: number, step: number): number[][] {
  const steps = Math.round(1 / step)
  const results: number[][] = []
  const recurse = (remaining: number, left: number, prefix: number[]) => {
    if (left === 1) {
      results.push([...prefix, remaining / steps])
      return
    }
    for (let i = 0; i <= remaining; i += 1) recurse(remaining - i, left - 1, [...prefix, i / steps])
  }
  recurse(steps, count, [])
  return results
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
