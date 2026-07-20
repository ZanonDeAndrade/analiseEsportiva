import type { FeatureExample } from '../preMatchFeatures.js'
import { fitVectorizer, type TabularVectorizer } from './tabularFeatures.js'
import {
  binaryMarket,
  clampProbability,
  COMPARISON_MARKETS,
  type PredictionResult,
  type PredictiveModel,
} from './types.js'

export interface LogisticConfig {
  iterations: number
  learningRate: number
  l2: number
}

export const DEFAULT_LOGISTIC_CONFIG: LogisticConfig = { iterations: 300, learningRate: 0.2, l2: 1e-3 }

interface Standardizer {
  mean: number[]
  std: number[]
}

function fitStandardizer(rows: number[][]): Standardizer {
  const dimensions = rows[0]?.length ?? 0
  const mean = new Array(dimensions).fill(0)
  const std = new Array(dimensions).fill(1)
  if (rows.length === 0) return { mean, std }
  for (const row of rows) for (let d = 0; d < dimensions; d += 1) mean[d] += row[d]
  for (let d = 0; d < dimensions; d += 1) mean[d] /= rows.length
  for (const row of rows) for (let d = 0; d < dimensions; d += 1) std[d] += (row[d] - mean[d]) ** 2
  for (let d = 0; d < dimensions; d += 1) std[d] = Math.sqrt(std[d] / rows.length) || 1
  return { mean, std }
}

function standardize(row: number[], scaler: Standardizer): number[] {
  return row.map((value, index) => (value - scaler.mean[index]) / scaler.std[index])
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

function trainBinary(rows: number[][], labels: number[], config: LogisticConfig): { weights: number[]; bias: number } {
  const dimensions = rows[0]?.length ?? 0
  const weights = new Array(dimensions).fill(0)
  let bias = 0
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const gradWeights = new Array(dimensions).fill(0)
    let gradBias = 0
    for (let i = 0; i < rows.length; i += 1) {
      const error = sigmoid(dot(weights, rows[i]) + bias) - labels[i]
      for (let d = 0; d < dimensions; d += 1) gradWeights[d] += error * rows[i][d]
      gradBias += error
    }
    const size = Math.max(1, rows.length)
    for (let d = 0; d < dimensions; d += 1) weights[d] -= config.learningRate * (gradWeights[d] / size + config.l2 * weights[d])
    bias -= config.learningRate * (gradBias / size)
  }
  return { weights, bias }
}

function trainSoftmax(rows: number[][], classes: number[], classCount: number, config: LogisticConfig) {
  const dimensions = rows[0]?.length ?? 0
  const weights = Array.from({ length: classCount }, () => new Array(dimensions).fill(0))
  const bias = new Array(classCount).fill(0)
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const gradWeights = Array.from({ length: classCount }, () => new Array(dimensions).fill(0))
    const gradBias = new Array(classCount).fill(0)
    for (let i = 0; i < rows.length; i += 1) {
      const probabilities = softmax(weights.map((weight, c) => dot(weight, rows[i]) + bias[c]))
      for (let c = 0; c < classCount; c += 1) {
        const error = probabilities[c] - (classes[i] === c ? 1 : 0)
        for (let d = 0; d < dimensions; d += 1) gradWeights[c][d] += error * rows[i][d]
        gradBias[c] += error
      }
    }
    const size = Math.max(1, rows.length)
    for (let c = 0; c < classCount; c += 1) {
      for (let d = 0; d < dimensions; d += 1) weights[c][d] -= config.learningRate * (gradWeights[c][d] / size + config.l2 * weights[c][d])
      bias[c] -= config.learningRate * (gradBias[c] / size)
    }
  }
  return { weights, bias }
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits)
  const exps = logits.map((value) => Math.exp(value - max))
  const total = exps.reduce((sum, value) => sum + value, 0) || 1
  return exps.map((value) => value / total)
}

function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

const BINARY_MARKETS: Array<{ market: (typeof COMPARISON_MARKETS)[number]; positive: string; negative: string; label: (example: FeatureExample) => number }> = [
  { market: 'OVER_1_5_GOALS', positive: 'over_1_5', negative: 'under_or_equal_1_5', label: (e) => (e.label.totalGoals > 1.5 ? 1 : 0) },
  { market: 'OVER_2_5_GOALS', positive: 'over_2_5', negative: 'under_or_equal_2_5', label: (e) => (e.label.totalGoals > 2.5 ? 1 : 0) },
  { market: 'OVER_3_5_GOALS', positive: 'over_3_5', negative: 'under_or_equal_3_5', label: (e) => (e.label.totalGoals > 3.5 ? 1 : 0) },
  { market: 'BOTH_TEAMS_SCORE', positive: 'btts_yes', negative: 'btts_no', label: (e) => (e.label.bothTeamsScored ? 1 : 0) },
]

/** 6/8. Regressão logística configurável sobre features pré-jogo (com tratamento de missing). */
export function createLogisticModel(config: LogisticConfig = DEFAULT_LOGISTIC_CONFIG): PredictiveModel {
  const metadata = () => ({
    name: 'logistica',
    family: 'logistic',
    description: 'Softmax para 1X2 e logística binária para mercados de gols, sobre features pré-jogo.',
    supportedMarkets: COMPARISON_MARKETS,
    hyperparameters: { ...config },
  })
  return {
    metadata,
    train(examples) {
      const vectorizer: TabularVectorizer = fitVectorizer(examples)
      const rawRows = examples.map((example) => vectorizer.transform(example))
      const scaler = fitStandardizer(rawRows)
      const rows = rawRows.map((row) => standardize(row, scaler))
      const outcomeClass = examples.map((example) => (example.label.outcome === 'H' ? 0 : example.label.outcome === 'D' ? 1 : 2))
      const softmaxModel = trainSoftmax(rows, outcomeClass, 3, config)
      const binaries = BINARY_MARKETS.map((definition) => ({
        definition,
        model: trainBinary(rows, examples.map(definition.label), config),
      }))

      return {
        metadata,
        predict(example): PredictionResult {
          const row = standardize(vectorizer.transform(example), scaler)
          const outcome = softmax(softmaxModel.weights.map((weight, c) => dot(weight, row) + softmaxModel.bias[c]))
          const home = clampProbability(outcome[0])
          const draw = clampProbability(outcome[1])
          const away = clampProbability(outcome[2])
          const result: PredictionResult = {
            '1X2': { home_win: home, draw, away_win: away },
            DOUBLE_CHANCE: {
              '1x': clampProbability(home + draw),
              '12': clampProbability(home + away),
              x2: clampProbability(draw + away),
            },
          }
          let over25 = 0.5
          let over35 = 0.5
          for (const binary of binaries) {
            const probability = sigmoid(dot(binary.model.weights, row) + binary.model.bias)
            result[binary.definition.market] = binaryMarket(binary.definition.positive, binary.definition.negative, probability)
            if (binary.definition.market === 'OVER_2_5_GOALS') over25 = probability
            if (binary.definition.market === 'OVER_3_5_GOALS') over35 = probability
          }
          result.UNDER_2_5_GOALS = binaryMarket('under_2_5', 'over_or_equal_2_5', 1 - over25)
          result.UNDER_3_5_GOALS = binaryMarket('under_3_5', 'over_or_equal_3_5', 1 - over35)
          return result
        },
      }
    },
  }
}

export const logisticModel = createLogisticModel()
