export const MARKET_IDS = [
  '1X2',
  'OVER_1_5_GOALS',
  'OVER_2_5_GOALS',
  'OVER_3_5_GOALS',
  'UNDER_2_5_GOALS',
  'UNDER_3_5_GOALS',
  'BOTH_TEAMS_SCORE',
  'DOUBLE_CHANCE',
  'CARDS',
  'CORNERS',
] as const

export type MarketId = (typeof MARKET_IDS)[number]
export type MatchOutcome = 'H' | 'D' | 'A'
export type MarketStatus = 'available' | 'insufficient_data'
export type PredictionConfidence = 'Baixa' | 'Media' | 'Alta'

export interface CsvRow {
  [column: string]: string | undefined
}

export interface NormalizedMatchRecord {
  index: number
  source: CsvRow
  league?: string
  competition?: string
  season?: string
  date?: string
  sourceProvider?: string
  updatedAt?: string
  homeTeam?: string
  awayTeam?: string
  fullTimeHomeGoals: number
  fullTimeAwayGoals: number
  outcome: MatchOutcome
  homeCorners?: number
  awayCorners?: number
  homeYellowCards?: number
  awayYellowCards?: number
  homeRedCards?: number
  awayRedCards?: number
}

export interface EngineeredMatchRecord extends NormalizedMatchRecord {
  totalGoals: number
  totalCorners?: number
  totalCards?: number
}

export interface SelectionDefinition {
  key: string
  label: string
}

export interface MarketDefinition {
  id: MarketId
  displayName: string
  category: 'result' | 'goals' | 'discipline' | 'set-pieces'
  selections: SelectionDefinition[]
  requiredColumns: string[]
  optionalColumns: string[]
}

export interface MarketLabels {
  market: MarketId
  labels: Record<string, boolean>
  columnsUsed: string[]
}

export interface SegmentModel {
  segmentKey: string
  status: MarketStatus
  sampleSize: number
  probabilities: Record<string, number>
  positiveCounts: Record<string, number>
  totalCounts: Record<string, number>
  reason?: string
}

export interface MarketModel {
  market: MarketId
  displayName: string
  status: MarketStatus
  minRows: number
  usableRows: number
  columnsUsed: string[]
  selections: SelectionDefinition[]
  global?: SegmentModel
  segments: Record<string, SegmentModel>
  reason?: string
}

export interface BetIntelModel {
  version: 1
  createdAt: string
  updatedAt: string
  minRows: number
  trainingRows: number
  sourceProviders: string[]
  competitions: string[]
  teamProfiles: Record<string, TeamProfile>
  markets: Record<MarketId, MarketModel>
}

export interface TeamProfile {
  key: string
  name: string
  matches: number
  homeMatches: number
  awayMatches: number
  wins: number
  draws: number
  losses: number
  homeWins: number
  homeDraws: number
  homeLosses: number
  awayWins: number
  awayDraws: number
  awayLosses: number
  goalsFor: number
  goalsAgainst: number
  homeGoalsFor: number
  homeGoalsAgainst: number
  awayGoalsFor: number
  awayGoalsAgainst: number
  over15: number
  over25: number
  over35: number
  bothTeamsScore: number
  cornersRows: number
  cornersOver85: number
  cornersOver95: number
  cardsRows: number
  cardsOver35: number
  cardsOver45: number
  cardsOver55: number
}

export interface IgnoredMarket {
  market: MarketId
  displayName: string
  status: 'dados_insuficientes'
  reason: string
  requiredColumns: string[]
  optionalColumns: string[]
}

export interface PredictionRequest {
  fixtureId?: string | number
  homeTeam: string
  awayTeam: string
  competition?: string
  league?: string
  season?: string
  date?: string
}

export interface PredictionSelection {
  key: string
  label: string
  probability: number
}

export interface PredictionMarket {
  market: MarketId
  displayName: string
  status: 'available'
  sourceSegment: string
  sampleSize: number
  confidence: PredictionConfidence
  selections: PredictionSelection[]
}

export interface PredictionResponse {
  game: PredictionRequest
  sourceProvider: string
  updatedAt: string
  sampleSize: number
  confidence: PredictionConfidence
  ethicalNotice: string
  availableMarkets: PredictionMarket[]
  ignoredMarkets: IgnoredMarket[]
}

export interface EvaluationMetric {
  market: MarketId
  displayName: string
  evaluatedRows: number
  selectionAccuracy: number
  brierScore: number
  coverage: number
}

export interface EvaluationReport {
  generatedAt: string
  trainRows: number
  testRows: number
  metrics: EvaluationMetric[]
  ignoredMarkets: IgnoredMarket[]
}

export interface BacktestReport {
  generatedAt: string
  initialWindow: number
  evaluatedRows: number
  metrics: EvaluationMetric[]
  ignoredPredictions: number
}

export interface FixtureRecord {
  id: string
  fixtureId?: number
  competition: string
  leagueId: string
  league: string
  season?: string
  round?: string
  date: string
  time: string
  isoDate: string
  status: string
  homeTeam: string
  awayTeam: string
  sourceProvider: string
  updatedAt: string
  isFallback?: boolean
}

export interface CompetitionSummary {
  id: string
  name: string
  provider: string
  season?: string
  fixtures: number
  updatedAt?: string
}

export interface SyncReport {
  generatedAt: string
  sourceProvider: string
  dataDir: string
  fixtures: number
  resultRows: number
  usedApiFootball: boolean
  usedFootballData: boolean
  simulated: boolean
  warnings: string[]
}
