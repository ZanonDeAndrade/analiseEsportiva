import type { FeatureExample } from '../preMatchFeatures.js'
import { fitVectorizer } from './tabularFeatures.js'
import {
  binaryMarket,
  clampProbability,
  COMPARISON_MARKETS,
  type PredictionResult,
  type PredictiveModel,
} from './types.js'

export interface GradientBoostingConfig {
  rounds: number
  learningRate: number
  maxDepth: number
  lambda: number
  minChild: number
  maxThresholds: number
}

export const DEFAULT_GBM_CONFIG: GradientBoostingConfig = {
  rounds: 25,
  learningRate: 0.15,
  maxDepth: 2,
  lambda: 1,
  minChild: 20,
  maxThresholds: 16,
}

type Tree = { leaf: number } | { feature: number; threshold: number; left: Tree; right: Tree }

interface BoostedModel {
  base: number
  trees: Tree[]
}

function trainBooster(rows: number[][], labels: number[], config: GradientBoostingConfig): BoostedModel {
  const positives = labels.reduce((sum, value) => sum + value, 0)
  const rate = clampProbability(positives / Math.max(1, labels.length))
  const base = Math.log(rate / (1 - rate))
  const scores = new Array(rows.length).fill(base)
  const trees: Tree[] = []

  for (let round = 0; round < config.rounds; round += 1) {
    const gradients = new Array(rows.length)
    const hessians = new Array(rows.length)
    for (let i = 0; i < rows.length; i += 1) {
      const probability = sigmoid(scores[i])
      gradients[i] = probability - labels[i]
      hessians[i] = Math.max(1e-6, probability * (1 - probability))
    }
    const tree = buildTree(rows, gradients, hessians, rows.map((_, index) => index), 0, config)
    trees.push(tree)
    for (let i = 0; i < rows.length; i += 1) scores[i] += config.learningRate * evaluateTree(tree, rows[i])
  }
  return { base, trees }
}

function buildTree(
  rows: number[][],
  gradients: number[],
  hessians: number[],
  indices: number[],
  depth: number,
  config: GradientBoostingConfig,
): Tree {
  const totalGradient = sum(indices, gradients)
  const totalHessian = sum(indices, hessians)
  const leafValue = -totalGradient / (totalHessian + config.lambda)

  if (depth >= config.maxDepth || indices.length < 2 * config.minChild) return { leaf: leafValue }

  let best: { feature: number; threshold: number; gain: number; left: number[]; right: number[] } | null = null
  const parentScore = (totalGradient * totalGradient) / (totalHessian + config.lambda)
  const featureCount = rows[0]?.length ?? 0

  for (let feature = 0; feature < featureCount; feature += 1) {
    for (const threshold of candidateThresholds(rows, indices, feature, config.maxThresholds)) {
      const left: number[] = []
      const right: number[] = []
      for (const index of indices) (rows[index][feature] <= threshold ? left : right).push(index)
      if (left.length < config.minChild || right.length < config.minChild) continue
      const gain =
        (sum(left, gradients) ** 2) / (sum(left, hessians) + config.lambda) +
        (sum(right, gradients) ** 2) / (sum(right, hessians) + config.lambda) -
        parentScore
      if (!best || gain > best.gain) best = { feature, threshold, gain, left, right }
    }
  }

  if (!best || best.gain <= 0) return { leaf: leafValue }
  return {
    feature: best.feature,
    threshold: best.threshold,
    left: buildTree(rows, gradients, hessians, best.left, depth + 1, config),
    right: buildTree(rows, gradients, hessians, best.right, depth + 1, config),
  }
}

function candidateThresholds(rows: number[][], indices: number[], feature: number, maxCandidates: number): number[] {
  const values = [...new Set(indices.map((index) => rows[index][feature]))].sort((a, b) => a - b)
  if (values.length <= 1) return []
  const step = Math.max(1, Math.floor(values.length / maxCandidates))
  const thresholds: number[] = []
  for (let i = step; i < values.length; i += step) thresholds.push((values[i - 1] + values[i]) / 2)
  return thresholds
}

function evaluateTree(tree: Tree, row: number[]): number {
  let node = tree
  while ('feature' in node) node = row[node.feature] <= node.threshold ? node.left : node.right
  return node.leaf
}

function predictBooster(model: BoostedModel, row: number[], config: GradientBoostingConfig): number {
  let score = model.base
  for (const tree of model.trees) score += config.learningRate * evaluateTree(tree, row)
  return clampProbability(sigmoid(score))
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

function sum(indices: number[], values: number[]): number {
  let total = 0
  for (const index of indices) total += values[index]
  return total
}

const BINARY_MARKETS = [
  { market: 'OVER_1_5_GOALS' as const, positive: 'over_1_5', negative: 'under_or_equal_1_5', label: (e: FeatureExample) => (e.label.totalGoals > 1.5 ? 1 : 0) },
  { market: 'OVER_2_5_GOALS' as const, positive: 'over_2_5', negative: 'under_or_equal_2_5', label: (e: FeatureExample) => (e.label.totalGoals > 2.5 ? 1 : 0) },
  { market: 'OVER_3_5_GOALS' as const, positive: 'over_3_5', negative: 'under_or_equal_3_5', label: (e: FeatureExample) => (e.label.totalGoals > 3.5 ? 1 : 0) },
  { market: 'BOTH_TEAMS_SCORE' as const, positive: 'btts_yes', negative: 'btts_no', label: (e: FeatureExample) => (e.label.bothTeamsScored ? 1 : 0) },
]

/** 7/8. Gradient boosting tabular configurável (árvores rasas, missing tratado, implementação própria). */
export function createGradientBoostingModel(config: GradientBoostingConfig = DEFAULT_GBM_CONFIG): PredictiveModel {
  const metadata = () => ({
    name: 'gradient-boosting',
    family: 'boosting',
    description: 'Boosting de árvores rasas sobre features pré-jogo (implementação própria em TypeScript).',
    supportedMarkets: COMPARISON_MARKETS,
    hyperparameters: { ...config },
  })
  return {
    metadata,
    train(examples) {
      const vectorizer = fitVectorizer(examples)
      const rows = examples.map((example) => vectorizer.transform(example))
      const outcomeBoosters = {
        home: trainBooster(rows, examples.map((e) => (e.label.outcome === 'H' ? 1 : 0)), config),
        draw: trainBooster(rows, examples.map((e) => (e.label.outcome === 'D' ? 1 : 0)), config),
        away: trainBooster(rows, examples.map((e) => (e.label.outcome === 'A' ? 1 : 0)), config),
      }
      const binaryBoosters = BINARY_MARKETS.map((definition) => ({
        definition,
        model: trainBooster(rows, examples.map(definition.label), config),
      }))

      return {
        metadata,
        predict(example): PredictionResult {
          const row = vectorizer.transform(example)
          const rawHome = predictBooster(outcomeBoosters.home, row, config)
          const rawDraw = predictBooster(outcomeBoosters.draw, row, config)
          const rawAway = predictBooster(outcomeBoosters.away, row, config)
          const total = rawHome + rawDraw + rawAway || 1
          const home = clampProbability(rawHome / total)
          const draw = clampProbability(rawDraw / total)
          const away = clampProbability(rawAway / total)
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
          for (const binary of binaryBoosters) {
            const probability = predictBooster(binary.model, row, config)
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

export const gradientBoostingModel = createGradientBoostingModel()
