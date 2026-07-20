import type { FeatureExample } from '../preMatchFeatures.js'
import { marketDefinitions } from '../markets.js'
import type { MarketId } from '../schemas.js'

/** Probabilidades por seleção de um mercado (chave da seleção -> prob em [0, 1]). */
export type MarketProbabilities = Record<string, number>

/** Predição de um modelo: apenas os mercados que ele suporta. */
export type PredictionResult = Partial<Record<MarketId, MarketProbabilities>>

export interface ModelMetadata {
  name: string
  family: string
  description: string
  supportedMarkets: MarketId[]
  hyperparameters?: Record<string, number | string | boolean>
}

export interface TrainedModel {
  metadata(): ModelMetadata
  /** Usa apenas features/contexto pré-jogo do exemplo; nunca o resultado real. */
  predict(example: FeatureExample): PredictionResult
}

export interface PredictiveModel {
  metadata(): ModelMetadata
  train(examples: FeatureExample[]): TrainedModel
}

/**
 * Mercados usados na comparação: todos derivam de gols, então todo modelo
 * (frequência, Poisson, Dixon-Coles, logística, boosting) consegue prevê-los,
 * mantendo a comparação justa. Cartões/escanteios continuam fora daqui porque
 * dependem de colunas opcionais e nem todo modelo os cobre.
 */
export const COMPARISON_MARKETS: MarketId[] = [
  '1X2',
  'OVER_1_5_GOALS',
  'OVER_2_5_GOALS',
  'OVER_3_5_GOALS',
  'UNDER_2_5_GOALS',
  'UNDER_3_5_GOALS',
  'BOTH_TEAMS_SCORE',
  'DOUBLE_CHANCE',
]

export function selectionKeys(market: MarketId): string[] {
  return marketDefinitions[market].selections.map((selection) => selection.key)
}

/** Resultado real (0/1) por seleção, derivado do rótulo — para pontuar Brier/log loss. */
export function actualOutcomes(market: MarketId, label: FeatureExample['label']): Record<string, number> {
  const home = label.outcome === 'H'
  const draw = label.outcome === 'D'
  const away = label.outcome === 'A'
  const total = label.totalGoals
  switch (market) {
    case '1X2':
      return { home_win: bit(home), draw: bit(draw), away_win: bit(away) }
    case 'DOUBLE_CHANCE':
      return { '1x': bit(home || draw), '12': bit(home || away), x2: bit(draw || away) }
    case 'OVER_1_5_GOALS':
      return { over_1_5: bit(total > 1.5), under_or_equal_1_5: bit(total <= 1.5) }
    case 'OVER_2_5_GOALS':
      return { over_2_5: bit(total > 2.5), under_or_equal_2_5: bit(total <= 2.5) }
    case 'OVER_3_5_GOALS':
      return { over_3_5: bit(total > 3.5), under_or_equal_3_5: bit(total <= 3.5) }
    case 'UNDER_2_5_GOALS':
      return { under_2_5: bit(total < 2.5), over_or_equal_2_5: bit(total >= 2.5) }
    case 'UNDER_3_5_GOALS':
      return { under_3_5: bit(total < 3.5), over_or_equal_3_5: bit(total >= 3.5) }
    case 'BOTH_TEAMS_SCORE':
      return { btts_yes: bit(label.bothTeamsScored), btts_no: bit(!label.bothTeamsScored) }
    default:
      return {}
  }
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(1e-6, Math.min(1 - 1e-6, value))
}

/** Constrói o par de seleções binárias a partir da probabilidade da seleção positiva. */
export function binaryMarket(positiveKey: string, negativeKey: string, positive: number): MarketProbabilities {
  const clamped = clampProbability(positive)
  return { [positiveKey]: clamped, [negativeKey]: clampProbability(1 - clamped) }
}

function bit(value: boolean): number {
  return value ? 1 : 0
}
