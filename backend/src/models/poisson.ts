import type { FeatureExample } from '../preMatchFeatures.js'
import { teamKey } from '../teamNames.js'
import { goalDistribution, marketsFromDistribution } from './goalDistribution.js'
import { COMPARISON_MARKETS, type PredictiveModel } from './types.js'

const SHRINKAGE = 4

interface TeamStrength {
  attackHome: number
  defenseHome: number
  attackAway: number
  defenseAway: number
}

interface GoalRates {
  leagueHomeGoals: number
  leagueAwayGoals: number
  competitionAverages: Map<string, { home: number; away: number }>
  teams: Map<string, TeamStrength>
}

/**
 * Estima força de ataque/defesa por time (casa/fora) com encolhimento (shrinkage)
 * em direção à média da liga, reduzindo sobreajuste de times com pouco histórico.
 */
function estimateGoalRates(examples: FeatureExample[], shrinkage: number): GoalRates {
  const leagueHomeGoals = mean(examples.map((example) => example.label.homeGoals)) || 1.3
  const leagueAwayGoals = mean(examples.map((example) => example.label.awayGoals)) || 1.1

  const competitionAverages = new Map<string, { home: number; away: number }>()
  const byCompetition = new Map<string, FeatureExample[]>()
  for (const example of examples) {
    const list = byCompetition.get(example.competition) ?? []
    list.push(example)
    byCompetition.set(example.competition, list)
  }
  for (const [competition, group] of byCompetition) {
    competitionAverages.set(competition, {
      home: mean(group.map((example) => example.label.homeGoals)) || leagueHomeGoals,
      away: mean(group.map((example) => example.label.awayGoals)) || leagueAwayGoals,
    })
  }

  interface Accumulator {
    homeMatches: number
    awayMatches: number
    homeScored: number
    homeConceded: number
    awayScored: number
    awayConceded: number
  }
  const accumulators = new Map<string, Accumulator>()
  const get = (name: string) => {
    const key = teamKey(name)
    const existing = accumulators.get(key)
    if (existing) return existing
    const created: Accumulator = { homeMatches: 0, awayMatches: 0, homeScored: 0, homeConceded: 0, awayScored: 0, awayConceded: 0 }
    accumulators.set(key, created)
    return created
  }

  for (const example of examples) {
    const home = get(example.homeTeam)
    const away = get(example.awayTeam)
    home.homeMatches += 1
    home.homeScored += example.label.homeGoals
    home.homeConceded += example.label.awayGoals
    away.awayMatches += 1
    away.awayScored += example.label.awayGoals
    away.awayConceded += example.label.homeGoals
  }

  const teams = new Map<string, TeamStrength>()
  for (const [key, acc] of accumulators) {
    teams.set(key, {
      attackHome: strength(acc.homeScored, acc.homeMatches, leagueHomeGoals, shrinkage),
      defenseHome: strength(acc.homeConceded, acc.homeMatches, leagueAwayGoals, shrinkage),
      attackAway: strength(acc.awayScored, acc.awayMatches, leagueAwayGoals, shrinkage),
      defenseAway: strength(acc.awayConceded, acc.awayMatches, leagueHomeGoals, shrinkage),
    })
  }
  return { leagueHomeGoals, leagueAwayGoals, competitionAverages, teams }
}

/** Razão encolhida em direção a 1 (média da liga). */
function strength(scored: number, matches: number, leagueAverage: number, shrinkage: number): number {
  const safeLeague = Math.max(0.1, leagueAverage)
  return (scored + shrinkage * safeLeague) / (matches + shrinkage) / safeLeague
}

const NEUTRAL: TeamStrength = { attackHome: 1, defenseHome: 1, attackAway: 1, defenseAway: 1 }

export interface PoissonConfig {
  shrinkage: number
  rho: number
}

export const DEFAULT_POISSON_CONFIG: PoissonConfig = { shrinkage: SHRINKAGE, rho: 0 }
export const DEFAULT_DIXON_COLES_CONFIG: PoissonConfig = { shrinkage: SHRINKAGE, rho: -0.05 }

function poissonFamilyModel(name: string, description: string, config: PoissonConfig): PredictiveModel {
  const { shrinkage, rho } = config
  const metadata = () => ({
    name,
    family: 'poisson',
    description,
    supportedMarkets: COMPARISON_MARKETS,
    hyperparameters: { shrinkage, rho },
  })
  return {
    metadata,
    train(examples) {
      const rates = estimateGoalRates(examples, shrinkage)
      return {
        metadata,
        predict(example) {
          const home = rates.teams.get(teamKey(example.homeTeam)) ?? NEUTRAL
          const away = rates.teams.get(teamKey(example.awayTeam)) ?? NEUTRAL
          const competitionAverage = rates.competitionAverages.get(example.competition)
          const baseHome = competitionAverage?.home ?? rates.leagueHomeGoals
          const baseAway = competitionAverage?.away ?? rates.leagueAwayGoals
          const lambdaHome = clampLambda(baseHome * home.attackHome * away.defenseAway)
          const lambdaAway = clampLambda(baseAway * away.attackAway * home.defenseHome)
          return marketsFromDistribution(goalDistribution(lambdaHome, lambdaAway, rho))
        },
      }
    },
  }
}

/** 4. Poisson independente (configurável). */
export function createPoissonModel(config: PoissonConfig = DEFAULT_POISSON_CONFIG): PredictiveModel {
  return poissonFamilyModel('poisson', 'Poisson independente com força de ataque/defesa encolhida e mando de campo.', { ...config, rho: 0 })
}

/** 5. Dixon-Coles (Poisson + correção de placares baixos, configurável). */
export function createDixonColesModel(config: PoissonConfig = DEFAULT_DIXON_COLES_CONFIG): PredictiveModel {
  return poissonFamilyModel('dixon-coles', 'Poisson com correção de Dixon-Coles para dependência em placares baixos.', config)
}

export const poissonModel = createPoissonModel()
export const dixonColesModel = createDixonColesModel()

function clampLambda(value: number): number {
  if (!Number.isFinite(value)) return 1.2
  return Math.max(0.15, Math.min(6, value))
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
