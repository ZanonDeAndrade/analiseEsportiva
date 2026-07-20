import type { FeatureExample } from '../preMatchFeatures.js'
import { predictMarkets } from '../prediction.js'
import { trainModel } from '../training.js'
import {
  COMPARISON_MARKETS,
  actualOutcomes,
  clampProbability,
  selectionKeys,
  type MarketProbabilities,
  type PredictiveModel,
  type PredictionResult,
  type TrainedModel,
} from './types.js'

/** Média das seleções por mercado sobre um conjunto de exemplos. */
function climatologyOf(examples: FeatureExample[]): PredictionResult {
  const result: PredictionResult = {}
  for (const market of COMPARISON_MARKETS) {
    const keys = selectionKeys(market)
    const sums = Object.fromEntries(keys.map((key) => [key, 0])) as MarketProbabilities
    for (const example of examples) {
      const actual = actualOutcomes(market, example.label)
      for (const key of keys) sums[key] += actual[key] ?? 0
    }
    const size = Math.max(1, examples.length)
    result[market] = Object.fromEntries(keys.map((key) => [key, clampProbability(sums[key] / size)]))
  }
  return result
}

/** 1. Baseline global: prevalência histórica de cada seleção em todo o treino. */
export const globalBaselineModel: PredictiveModel = {
  metadata: () => ({
    name: 'baseline-global',
    family: 'climatology',
    description: 'Prevalência histórica global de cada seleção (frequência-base).',
    supportedMarkets: COMPARISON_MARKETS,
  }),
  train(examples) {
    const climatology = climatologyOf(examples)
    return {
      metadata: globalBaselineModel.metadata,
      predict: () => climatology,
    }
  },
}

/** 2. Baseline por competição: prevalência histórica por competição, com fallback global. */
export const competitionBaselineModel: PredictiveModel = {
  metadata: () => ({
    name: 'baseline-competition',
    family: 'climatology',
    description: 'Prevalência histórica por competição, com fallback para a global.',
    supportedMarkets: COMPARISON_MARKETS,
  }),
  train(examples) {
    const global = climatologyOf(examples)
    const groups = new Map<string, FeatureExample[]>()
    for (const example of examples) {
      const list = groups.get(example.competition) ?? []
      list.push(example)
      groups.set(example.competition, list)
    }
    const byCompetition = new Map<string, PredictionResult>()
    for (const [competition, group] of groups) byCompetition.set(competition, climatologyOf(group))
    return {
      metadata: competitionBaselineModel.metadata,
      predict: (example) => byCompetition.get(example.competition) ?? global,
    }
  },
}

/** Previsão uniforme: 1/3 para cada resultado do 1X2 (referência mínima). */
export const uniformBaselineModel: PredictiveModel = {
  metadata: () => ({
    name: 'baseline-uniforme',
    family: 'baseline',
    description: 'Previsão uniforme (1/3, 1/3, 1/3) para o 1X2.',
    supportedMarkets: ['1X2'],
  }),
  train() {
    const third = clampProbability(1 / 3)
    return {
      metadata: uniformBaselineModel.metadata,
      predict: () => ({ '1X2': { home_win: third, draw: third, away_win: third } }),
    }
  },
}

/** Classe mais comum: prevê one-hot no resultado majoritário do treino. */
export const majorityClassBaselineModel: PredictiveModel = {
  metadata: () => ({
    name: 'baseline-classe-comum',
    family: 'baseline',
    description: 'Prevê sempre o resultado 1X2 mais frequente no treino (one-hot).',
    supportedMarkets: ['1X2'],
  }),
  train(examples) {
    const counts = { H: 0, D: 0, A: 0 }
    for (const example of examples) counts[example.label.outcome] += 1
    const majority = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'H') as 'H' | 'D' | 'A'
    const one = clampProbability(1)
    const zero = clampProbability(0)
    const prediction: PredictionResult = {
      '1X2': {
        home_win: majority === 'H' ? one : zero,
        draw: majority === 'D' ? one : zero,
        away_win: majority === 'A' ? one : zero,
      },
    }
    return { metadata: majorityClassBaselineModel.metadata, predict: () => prediction }
  },
}

/** 3. Modelo atual: frequências segmentadas + perfis de time (envolvido na interface). */
export const frequencyProfileModel: PredictiveModel = {
  metadata: () => ({
    name: 'frequency-profile-atual',
    family: 'frequency',
    description: 'Modelo de produção: frequências por segmento + perfis de time.',
    supportedMarkets: COMPARISON_MARKETS,
  }),
  train(examples) {
    const model = trainModel(examples.map((example) => example.record), { minRows: 1 })
    return {
      metadata: frequencyProfileModel.metadata,
      predict(example): PredictionResult {
        const response = predictMarkets(model, {
          homeTeam: example.homeTeam,
          awayTeam: example.awayTeam,
          competition: example.record.competition,
          league: example.record.league,
          season: example.season,
          date: example.date,
        })
        const result: PredictionResult = {}
        for (const market of response.availableMarkets) {
          if (!COMPARISON_MARKETS.includes(market.market)) continue
          result[market.market] = Object.fromEntries(
            market.selections.map((selection) => [selection.key, clampProbability(selection.probability / 100)]),
          )
        }
        return result
      },
    } satisfies TrainedModel
  },
}
