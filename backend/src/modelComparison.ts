import type { FeatureExample } from './preMatchFeatures.js'
import type { MarketId } from './schemas.js'
import type { WalkForwardPlan } from './temporalValidation.js'
import {
  COMPARISON_MARKETS,
  actualOutcomes,
  clampProbability,
  selectionKeys,
  type PredictiveModel,
} from './models/types.js'

export interface MarketScore {
  market: MarketId
  predictions: number
  brierScore: number | null
  logLoss: number | null
  coverage: number
}

export interface ModelScore {
  name: string
  family: string
  description: string
  markets: MarketScore[]
  meanBrierScore: number | null
  meanLogLoss: number | null
  coveredMarkets: number
}

export interface ComparisonReport {
  strategy: string
  folds: number
  validationExamples: number
  models: ModelScore[]
  ranking: Array<{ name: string; meanBrierScore: number | null }>
  note: string
}

interface Accumulator {
  brier: number
  logLoss: number
  predictions: number
}

/**
 * Compara modelos via walk-forward, treinando cada um no treino de cada fold e
 * pontuando na validação. O conjunto de teste final NÃO entra aqui: ele é
 * reservado e usado apenas uma vez, depois que um modelo for escolhido.
 */
export function compareModels(
  plan: WalkForwardPlan,
  exampleByIndex: Map<number, FeatureExample>,
  models: PredictiveModel[],
): ComparisonReport {
  const modelScores: ModelScore[] = []
  let validationExamples = 0

  for (const model of models) {
    const accumulators = new Map<MarketId, Accumulator>()
    for (const market of COMPARISON_MARKETS) accumulators.set(market, { brier: 0, logLoss: 0, predictions: 0 })
    let possiblePerMarket = 0

    for (const fold of plan.folds) {
      const trainExamples = mapExamples(fold.train, exampleByIndex)
      const validationSet = mapExamples(fold.validation, exampleByIndex)
      if (trainExamples.length === 0 || validationSet.length === 0) continue
      possiblePerMarket += validationSet.length

      const trained = model.train(trainExamples)
      for (const example of validationSet) {
        const prediction = trained.predict(example)
        for (const market of COMPARISON_MARKETS) {
          const probabilities = prediction[market]
          if (!probabilities) continue
          const actual = actualOutcomes(market, example.label)
          const keys = selectionKeys(market)
          let brier = 0
          let logLoss = 0
          for (const key of keys) {
            const probability = clampProbability(probabilities[key] ?? 0)
            const outcome = actual[key] ?? 0
            brier += (probability - outcome) ** 2
            logLoss += -(outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability))
          }
          const accumulator = accumulators.get(market)!
          accumulator.brier += brier / keys.length
          accumulator.logLoss += logLoss / keys.length
          accumulator.predictions += 1
        }
      }
    }

    if (model === models[0]) validationExamples = possiblePerMarket

    const markets: MarketScore[] = COMPARISON_MARKETS.map((market) => {
      const accumulator = accumulators.get(market)!
      const predictions = accumulator.predictions
      return {
        market,
        predictions,
        brierScore: predictions > 0 ? round(accumulator.brier / predictions) : null,
        logLoss: predictions > 0 ? round(accumulator.logLoss / predictions) : null,
        coverage: possiblePerMarket > 0 ? round(predictions / possiblePerMarket) : 0,
      }
    })
    const scored = markets.filter((market) => market.brierScore !== null)
    const meta = model.metadata()
    modelScores.push({
      name: meta.name,
      family: meta.family,
      description: meta.description,
      markets,
      meanBrierScore: scored.length > 0 ? round(mean(scored.map((market) => market.brierScore!))) : null,
      meanLogLoss: scored.length > 0 ? round(mean(scored.map((market) => market.logLoss!))) : null,
      coveredMarkets: scored.length,
    })
  }

  const ranking = [...modelScores]
    .filter((model) => model.meanBrierScore !== null)
    .sort((left, right) => left.meanBrierScore! - right.meanBrierScore!)
    .map((model) => ({ name: model.name, meanBrierScore: model.meanBrierScore }))

  return {
    strategy: plan.strategy,
    folds: plan.folds.length,
    validationExamples,
    models: modelScores,
    ranking,
    note: 'Comparação por walk-forward no development (treino + validação). O teste final é reservado e não foi usado. Nenhum modelo é promovido automaticamente.',
  }
}

function mapExamples(records: WalkForwardPlan['folds'][number]['train'], exampleByIndex: Map<number, FeatureExample>) {
  const examples: FeatureExample[] = []
  for (const record of records) {
    const example = exampleByIndex.get(record.index)
    if (example) examples.push(example)
  }
  return examples
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
