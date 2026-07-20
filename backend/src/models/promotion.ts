/**
 * ETAPA 15 — Seleção e promoção de modelo.
 *
 * Um modelo só é `validated` quando passa em TODOS os critérios abaixo — nunca
 * apenas por ter maior acurácia. O ciclo de vida é
 * candidate → validated | rejected → active → archived, e a promoção final é
 * uma decisão explícita (nunca automática) contra o teste reservado.
 */

export type ModelStatus = 'candidate' | 'validated' | 'rejected' | 'active' | 'archived'

export interface PromotionInputs {
  /** Skill de Brier (1 - cand/baseline) por fold temporal; positivo = melhor. */
  perFoldBrierSkill: number[]
  /** Skill de Brier por competição. */
  perCompetitionBrierSkill: Array<{ competition: string; skill: number }>
  /** Skill agregado de Brier e Log Loss contra o baseline. */
  brierSkillVsBaseline: number
  logLossSkillVsBaseline: number
  /** ECE do candidato menos ECE do atual (positivo = calibração pior). */
  calibrationEceDelta: number
  /** Cobertura percentual do candidato. */
  coveragePct: number
  /** Regressão no mercado importante (Brier candidato - atual no 1X2); positivo = piorou. */
  importantMarketRegression: number
  /** Tempo de treino+predição na validação (ms). */
  runtimeMs: number
  /** Todos os testes automatizados passaram. */
  testsPassed: boolean
  /** Metadados completos (versão, seed, features, período, fingerprint). */
  metadataComplete: boolean
}

export interface PromotionThresholds {
  minSkill: number
  maxEceDelta: number
  minFoldWinRate: number
  minCompetitionWinRate: number
  minCoveragePct: number
  maxImportantRegression: number
  maxRuntimeMs: number
}

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  minSkill: 0,
  maxEceDelta: 0.01,
  minFoldWinRate: 0.6,
  minCompetitionWinRate: 0.6,
  minCoveragePct: 90,
  maxImportantRegression: 0.002,
  maxRuntimeMs: 60_000,
}

export interface CriterionResult {
  criterion: string
  passed: boolean
  detail: string
}

export interface PromotionDecision {
  status: Extract<ModelStatus, 'validated' | 'rejected'>
  criteria: CriterionResult[]
  passedCount: number
  totalCriteria: number
  reasons: string[]
}

export function evaluatePromotion(
  inputs: PromotionInputs,
  thresholds: PromotionThresholds = DEFAULT_PROMOTION_THRESHOLDS,
): PromotionDecision {
  const foldWinRate = rate(inputs.perFoldBrierSkill, (skill) => skill > 0)
  const competitionWinRate = rate(inputs.perCompetitionBrierSkill.map((item) => item.skill), (skill) => skill > 0)

  const criteria: CriterionResult[] = [
    result(
      '1. supera baseline em Brier ou Log Loss',
      inputs.brierSkillVsBaseline > thresholds.minSkill || inputs.logLossSkillVsBaseline > thresholds.minSkill,
      `skill Brier=${round(inputs.brierSkillVsBaseline)}, logLoss=${round(inputs.logLossSkillVsBaseline)}`,
    ),
    result(
      '2. calibração não piora significativamente',
      inputs.calibrationEceDelta <= thresholds.maxEceDelta,
      `ΔECE=${round(inputs.calibrationEceDelta)} (limite ${thresholds.maxEceDelta})`,
    ),
    result(
      '3. consistente em múltiplos folds temporais',
      foldWinRate >= thresholds.minFoldWinRate,
      `${round(foldWinRate * 100)}% dos folds com skill positivo`,
    ),
    result(
      '4. não depende de poucas competições',
      competitionWinRate >= thresholds.minCompetitionWinRate,
      `${round(competitionWinRate * 100)}% das competições melhoram`,
    ),
    result(
      '5. cobertura aceitável',
      inputs.coveragePct >= thresholds.minCoveragePct,
      `cobertura ${round(inputs.coveragePct)}% (mínimo ${thresholds.minCoveragePct}%)`,
    ),
    result(
      '6. sem regressão crítica em mercado importante',
      inputs.importantMarketRegression <= thresholds.maxImportantRegression,
      `regressão 1X2=${round(inputs.importantMarketRegression)} (limite ${thresholds.maxImportantRegression})`,
    ),
    result(
      '7. tempo de execução aceitável',
      inputs.runtimeMs <= thresholds.maxRuntimeMs,
      `${Math.round(inputs.runtimeMs)}ms (limite ${thresholds.maxRuntimeMs}ms)`,
    ),
    result('8. todos os testes passam', inputs.testsPassed, inputs.testsPassed ? 'ok' : 'testes falharam'),
    result('9. versão e metadados completos', inputs.metadataComplete, inputs.metadataComplete ? 'ok' : 'metadados incompletos'),
  ]

  const passedCount = criteria.filter((criterion) => criterion.passed).length
  const status = passedCount === criteria.length ? 'validated' : 'rejected'
  return {
    status,
    criteria,
    passedCount,
    totalCriteria: criteria.length,
    reasons: criteria.filter((criterion) => !criterion.passed).map((criterion) => criterion.criterion),
  }
}

const TRANSITIONS: Record<ModelStatus, ModelStatus[]> = {
  candidate: ['validated', 'rejected'],
  validated: ['active', 'rejected', 'archived'],
  rejected: ['archived', 'candidate'],
  active: ['archived'],
  archived: [],
}

/** Só permite transições explícitas e válidas do ciclo de vida. */
export function canTransition(from: ModelStatus, to: ModelStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

function result(criterion: string, passed: boolean, detail: string): CriterionResult {
  return { criterion, passed, detail }
}

function rate(values: number[], predicate: (value: number) => boolean): number {
  if (values.length === 0) return 0
  return values.filter(predicate).length / values.length
}

function round(value: number): number {
  return Math.round(value * 100000) / 100000
}
