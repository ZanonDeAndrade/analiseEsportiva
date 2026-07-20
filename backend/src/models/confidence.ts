/**
 * ETAPA 17 — Diferenciação de dados_insuficientes e confiança calculada.
 *
 * `dados_insuficientes` é preservado, mas as causas são DIFERENCIADAS (dado
 * ausente vs. valor zero vs. amostra insuficiente vs. competição sem histórico
 * vs. equipe nova vs. feature indisponível). A confiança NÃO é um rótulo
 * arbitrário: é calculada a partir de tamanho de amostra, estabilidade entre
 * folds, calibração, distância do baseline, disponibilidade de features e
 * incerteza estatística — e nunca é apresentada como promessa de acerto.
 */

export type DataStatus =
  | 'sufficient'
  | 'zero_value'
  | 'missing_data'
  | 'insufficient_sample'
  | 'competition_no_history'
  | 'new_team'
  | 'feature_unavailable'

export interface MinimumCriteria {
  minMatchesPerTeam: number
  minMatchesPerCompetition: number
  minSamplePerMarket: number
  minWindow: number
}

export const DEFAULT_MINIMUM_CRITERIA: MinimumCriteria = {
  minMatchesPerTeam: 5,
  minMatchesPerCompetition: 20,
  minSamplePerMarket: 20,
  minWindow: 3,
}

export interface DataStatusInputs {
  featureAvailable: boolean
  competitionHasHistory: boolean
  teamMatches: number
  competitionMatches: number
  marketSampleSize: number
  windowSize: number
  /** valor do dado; `undefined` = ausente; `0` = zero legítimo (distinto de ausente). */
  value?: number
}

/**
 * Classifica a causa (prioridade da mais bloqueante para a menos). Valor zero é
 * uma observação legítima e NÃO é confundido com ausência de dado.
 */
export function classifyDataStatus(inputs: DataStatusInputs, criteria: MinimumCriteria = DEFAULT_MINIMUM_CRITERIA): DataStatus {
  if (!inputs.featureAvailable) return 'feature_unavailable'
  if (!inputs.competitionHasHistory) return 'competition_no_history'
  if (inputs.teamMatches === 0) return 'new_team'
  if (inputs.value === undefined) return 'missing_data'
  if (
    inputs.teamMatches < criteria.minMatchesPerTeam ||
    inputs.competitionMatches < criteria.minMatchesPerCompetition ||
    inputs.marketSampleSize < criteria.minSamplePerMarket ||
    inputs.windowSize < criteria.minWindow
  ) {
    return 'insufficient_sample'
  }
  if (inputs.value === 0) return 'zero_value'
  return 'sufficient'
}

/** Só há dados suficientes quando o valor existe (zero conta como observado). */
export function isSufficient(status: DataStatus): boolean {
  return status === 'sufficient' || status === 'zero_value'
}

export interface ConfidenceInputs {
  sampleSize: number
  minRows: number
  /** desvio-padrão do desempenho entre folds temporais (menor = mais estável). */
  foldStabilityStdDev: number
  /** Expected Calibration Error do mercado (menor = melhor). */
  calibrationEce: number
  /** skill vs baseline (>0 = melhor que o baseline). */
  skillVsBaseline: number
  /** fração [0,1] das features necessárias disponíveis. */
  featureAvailability: number
  /** largura do intervalo de confiança da métrica principal (menor = mais preciso). */
  uncertaintyWidth: number
}

export interface ConfidenceComponents {
  sample: number
  stability: number
  calibration: number
  baseline: number
  availability: number
  uncertainty: number
}

export interface ConfidenceResult {
  score: number
  level: 'Baixa' | 'Media' | 'Alta'
  components: ConfidenceComponents
  disclaimer: string
}

const WEIGHTS: ConfidenceComponents = {
  sample: 0.25,
  baseline: 0.2,
  calibration: 0.2,
  stability: 0.15,
  uncertainty: 0.1,
  availability: 0.1,
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  const components: ConfidenceComponents = {
    sample: clamp01(inputs.sampleSize / Math.max(1, inputs.minRows * 5)),
    stability: clamp01(1 - inputs.foldStabilityStdDev / 0.05),
    calibration: clamp01(1 - inputs.calibrationEce / 0.1),
    baseline: clamp01(0.5 + inputs.skillVsBaseline * 5),
    availability: clamp01(inputs.featureAvailability),
    uncertainty: clamp01(1 - inputs.uncertaintyWidth / 0.2),
  }
  const score = round(
    components.sample * WEIGHTS.sample +
      components.stability * WEIGHTS.stability +
      components.calibration * WEIGHTS.calibration +
      components.baseline * WEIGHTS.baseline +
      components.availability * WEIGHTS.availability +
      components.uncertainty * WEIGHTS.uncertainty,
  )
  const level: ConfidenceResult['level'] = score >= 0.66 ? 'Alta' : score >= 0.4 ? 'Media' : 'Baixa'
  return {
    score,
    level,
    components,
    disclaimer: 'A confiança reflete a robustez estatística da estimativa (amostra, calibração, estabilidade, incerteza); não é promessa de acerto nem recomendação de aposta.',
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
