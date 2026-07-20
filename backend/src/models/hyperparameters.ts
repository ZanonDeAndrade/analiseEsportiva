import { DEFAULT_GBM_CONFIG, type GradientBoostingConfig } from './gradientBoosting.js'
import { DEFAULT_LOGISTIC_CONFIG, type LogisticConfig } from './logistic.js'
import { DEFAULT_POISSON_CONFIG, type PoissonConfig } from './poisson.js'

/**
 * ETAPA 14 — Configuração explícita e reproduzível de hiperparâmetros.
 *
 * Todos os parâmetros ajustáveis do pipeline ficam num único tipo com padrões.
 * A seleção é feita SOMENTE na validação temporal (o teste final é reservado),
 * com seed fixa, espaço de busca registrado e cada experimento armazenado.
 * Combinações inválidas são rejeitadas antes de treinar, e a busca é limitada
 * para não sobreajustar a validação.
 */
export interface HyperparameterConfig {
  featureWindows: number[]
  recencyLambda: number
  eloK: number
  homeAdvantage: number
  minMatchesPerTeam: number
  minMatchesPerCompetition: number
  poisson: PoissonConfig
  logistic: LogisticConfig
  gbm: GradientBoostingConfig
  calibration: 'none' | 'platt' | 'isotonic' | 'temperature'
}

export const DEFAULT_HYPERPARAMETERS: HyperparameterConfig = {
  featureWindows: [5, 10, 20],
  recencyLambda: 0.02,
  eloK: 20,
  homeAdvantage: 60,
  minMatchesPerTeam: 0,
  minMatchesPerCompetition: 6,
  poisson: DEFAULT_POISSON_CONFIG,
  logistic: DEFAULT_LOGISTIC_CONFIG,
  gbm: DEFAULT_GBM_CONFIG,
  calibration: 'none',
}

export interface ValidationIssue {
  field: string
  message: string
}

/** Impede combinações inválidas (retorna lista vazia quando o config é válido). */
export function validateHyperparameters(config: HyperparameterConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const check = (condition: boolean, field: string, message: string) => {
    if (!condition) issues.push({ field, message })
  }

  check(config.featureWindows.length > 0, 'featureWindows', 'É necessário ao menos uma janela.')
  check(config.featureWindows.every((window) => Number.isInteger(window) && window > 0), 'featureWindows', 'Janelas devem ser inteiros positivos.')
  check(isStrictlyAscending(config.featureWindows), 'featureWindows', 'Janelas devem ser estritamente crescentes.')
  check(config.recencyLambda >= 0 && config.recencyLambda < 1, 'recencyLambda', 'Lambda de recência deve estar em [0, 1).')
  check(config.eloK > 0 && config.eloK <= 100, 'eloK', 'K do Elo deve estar em (0, 100].')
  check(config.homeAdvantage >= 0 && config.homeAdvantage <= 300, 'homeAdvantage', 'Vantagem de casa deve estar em [0, 300].')
  check(Number.isInteger(config.minMatchesPerTeam) && config.minMatchesPerTeam >= 0, 'minMatchesPerTeam', 'Mínimo de partidas por equipe deve ser inteiro >= 0.')
  check(Number.isInteger(config.minMatchesPerCompetition) && config.minMatchesPerCompetition >= 0, 'minMatchesPerCompetition', 'Mínimo de partidas por competição deve ser inteiro >= 0.')

  check(config.poisson.shrinkage >= 0 && config.poisson.shrinkage <= 50, 'poisson.shrinkage', 'Shrinkage do Poisson deve estar em [0, 50].')
  check(config.poisson.rho >= -1 && config.poisson.rho <= 1, 'poisson.rho', 'rho de Dixon-Coles deve estar em [-1, 1].')

  check(config.logistic.iterations > 0 && config.logistic.iterations <= 5000, 'logistic.iterations', 'Iterações da logística devem estar em (0, 5000].')
  check(config.logistic.learningRate > 0 && config.logistic.learningRate <= 1, 'logistic.learningRate', 'Taxa de aprendizado da logística deve estar em (0, 1].')
  check(config.logistic.l2 >= 0, 'logistic.l2', 'Regularização L2 deve ser >= 0.')

  check(config.gbm.rounds > 0 && config.gbm.rounds <= 1000, 'gbm.rounds', 'Rounds do boosting devem estar em (0, 1000].')
  check(config.gbm.learningRate > 0 && config.gbm.learningRate <= 1, 'gbm.learningRate', 'Taxa de aprendizado do boosting deve estar em (0, 1].')
  check(Number.isInteger(config.gbm.maxDepth) && config.gbm.maxDepth >= 1 && config.gbm.maxDepth <= 6, 'gbm.maxDepth', 'Profundidade do boosting deve estar em [1, 6].')
  check(config.gbm.lambda >= 0, 'gbm.lambda', 'Regularização lambda do boosting deve ser >= 0.')
  check(Number.isInteger(config.gbm.minChild) && config.gbm.minChild >= 1, 'gbm.minChild', 'minChild do boosting deve ser inteiro >= 1.')
  check(Number.isInteger(config.gbm.maxThresholds) && config.gbm.maxThresholds >= 2, 'gbm.maxThresholds', 'maxThresholds do boosting deve ser inteiro >= 2.')

  check(['none', 'platt', 'isotonic', 'temperature'].includes(config.calibration), 'calibration', 'Método de calibração inválido.')
  return issues
}

export interface Experiment<Config> {
  config: Config
  valid: boolean
  issues: ValidationIssue[]
  validationScore: number | null
}

export interface SearchResult<Config> {
  space: string
  seed: number
  gridSize: number
  evaluated: number
  skipped: number
  best: Config | null
  bestScore: number | null
  experiments: Experiment<Config>[]
}

/**
 * Busca em grade determinística. `evaluate` DEVE usar apenas validação temporal
 * (nunca o teste final) e retornar um score onde menor é melhor (ex.: Brier).
 * Cada experimento é registrado; configs inválidos são pulados. `maxExperiments`
 * limita a busca para evitar sobreajuste à validação.
 */
export function gridSearch<Config>(
  space: string,
  grid: Config[],
  validate: (config: Config) => ValidationIssue[],
  evaluate: (config: Config) => number,
  options: { seed?: number; maxExperiments?: number } = {},
): SearchResult<Config> {
  const seed = options.seed ?? 2026
  const maxExperiments = options.maxExperiments ?? 32
  const experiments: Experiment<Config>[] = []
  let evaluated = 0
  let skipped = 0
  let best: Config | null = null
  let bestScore: number | null = null

  for (const config of grid.slice(0, maxExperiments)) {
    const issues = validate(config)
    if (issues.length > 0) {
      skipped += 1
      experiments.push({ config, valid: false, issues, validationScore: null })
      continue
    }
    const validationScore = evaluate(config)
    evaluated += 1
    experiments.push({ config, valid: true, issues: [], validationScore })
    if (bestScore === null || validationScore < bestScore) {
      bestScore = validationScore
      best = config
    }
  }

  return { space, seed, gridSize: grid.length, evaluated, skipped, best, bestScore, experiments }
}

function isStrictlyAscending(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) if (values[i] <= values[i - 1]) return false
  return true
}
