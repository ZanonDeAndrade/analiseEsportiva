/* Shared domain types for BetIntel AI. */

export type Result = 'V' | 'E' | 'D'
export type Confidence = 'Baixa' | 'Média' | 'Alta'
export type LeagueId = 'BRA' | 'PL' | 'LL' | 'L1' | 'BUN'
export type Period = 'hoje' | 'amanha' | '7dias'

/** A single past result shown in the "Últimos 5 jogos" panel. */
export interface RecentMatch {
  result: Result
  opponent: string
  score: string
}

/**
 * Core probabilities for a fixture, expressed as estimated percentages (0–100).
 * Educational estimates derived from the backend model — never odds from a real sportsbook.
 */
export interface MatchProbabilities {
  homeWin?: number
  draw?: number
  awayWin?: number
  over15?: number
  over25?: number
  bothTeamsScore?: number
  /** Dupla chance 1X (casa ou empate). */
  doubleChance?: number
}

/** Aggregated educational statistics for the fixture. */
export interface MatchStats {
  homeAvgGoalsFor?: number
  awayAvgGoalsFor?: number
  homeAvgGoalsAgainst?: number
  awayAvgGoalsAgainst?: number
  over15Rate?: number
  over25Rate?: number
  bttsRate?: number
  /** Clean sheets in the last 5 games (0–5). */
  cleanSheets?: number
}

export interface Match {
  id: string
  fixtureId?: number
  leagueId: LeagueId
  league: string
  competition?: string
  date: string
  time: string
  isoDate?: string
  period: Period
  homeTeam: string
  awayTeam: string
  homeForm: Result[]
  awayForm: Result[]
  probabilities: MatchProbabilities
  stats: MatchStats
  lastMatchesHome: RecentMatch[]
  lastMatchesAway: RecentMatch[]
  aiSummary: string
  confidence: Confidence
  sourceProvider?: string
  updatedAt?: string
  sampleSize?: number
  ethicalNotice?: string
  modelVersion?: string
  datasetVersion?: string
  codeVersion?: string
  featureSetVersion?: string
  modelPeriod?: { from: string; to: string }
  limitations?: string[]
  availableMarkets?: Array<{
    market: string
    displayName: string
    sampleSize: number
    confidence: string
    sourceSegment: string
    period: { from: string; to: string }
    modelVersion: string
    limitations: string[]
    selections: Array<{
      key: string
      label: string
      probability: number
      uncertainty: { lower: number; upper: number; level: 0.95; method: 'wilson' }
    }>
  }>
  ignoredMarkets?: Array<{
    market: string
    displayName: string
    status: 'dados_insuficientes'
    reason: string
  }>
  isFallback?: boolean
  backendError?: string
}
