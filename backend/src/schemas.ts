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
  period?: { from: string; to: string }
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
  provenance: ModelProvenance
}

export interface ModelProvenance {
  codeVersion: string
  featureSetVersion: string
  modelSchemaVersion: string
  hyperparameters: { minRows: number; seed: number }
  trainingPeriod: { from: string; to: string }
  artifactFingerprint: string
  runtime: { node: string; platform: string; architecture: string }
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
  uncertainty: { lower: number; upper: number; level: 0.95; method: 'wilson' }
}

export interface PredictionMarket {
  market: MarketId
  displayName: string
  status: 'available'
  sourceSegment: string
  sampleSize: number
  confidence: PredictionConfidence
  period: { from: string; to: string }
  modelVersion: string
  limitations: string[]
  selections: PredictionSelection[]
}

export interface PredictionResponse {
  game: PredictionRequest
  sourceProvider: string
  updatedAt: string
  sampleSize: number
  confidence: PredictionConfidence
  ethicalNotice: string
  modelVersion: string
  datasetVersion?: string
  codeVersion: string
  featureSetVersion: string
  period: { from: string; to: string }
  limitations: string[]
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
  logLoss: number
  baselines: EvaluationBaseline[]
  brierDecomposition: BrierDecomposition
  calibration: CalibrationBin[]
  expectedCalibrationError: number
  uncertainty: {
    brierScore: ConfidenceInterval
    selectionAccuracy: ConfidenceInterval
  }
}

export interface EvaluationBaseline {
  name: 'climatology' | 'uniform'
  brierScore: number
  logLoss: number
  sampleSize: number
}

export interface CalibrationBin {
  lower: number
  upper: number
  meanPredicted: number
  observedRate: number
  sampleSize: number
}

export interface BrierDecomposition {
  reliability: number
  resolution: number
  uncertainty: number
  recomposed: number
}

export interface ConfidenceInterval {
  lower: number
  upper: number
  level: 0.95
  method: 'wilson' | 'bootstrap'
}

export interface TemporalPartition {
  rows: number
  from: string
  to: string
}

export interface CompetitionSplitCount {
  competition: string
  total: number
  train: number
  validation: number
  test: number
}

export interface TemporalSplitStrategyReport {
  strategy: 'per_competition_temporal'
  trainRatio: number
  validationRatio: number
  testRatio: number
  discardedRows: number
  train: TemporalPartition
  test: TemporalPartition
  competitions: CompetitionSplitCount[]
}

export interface EvaluationTrace {
  runId: string
  seed: number
  codeVersion: string
  datasetVersionId?: string
  modelVersionId?: string
  featureSetVersion: string
  modelSchemaVersion: string
  metricsSchemaVersion: string
  hyperparameters: Record<string, number | string | boolean>
  runtime: { node: string; platform: string; architecture: string }
}

export interface DriftReport {
  status: 'stable' | 'warning' | 'critical' | 'dados_insuficientes'
  sampleSize: { reference: number; current: number }
  populationStabilityIndex?: number
  missingnessDelta: { corners: number; cards: number }
  limitations: string[]
}

export interface PerformanceDriftReport {
  status: 'stable' | 'improved' | 'degraded' | 'dados_insuficientes'
  comparedMarkets: number
  currentMeanBrier?: number
  referenceMeanBrier?: number
  delta?: number
  limitations: string[]
}

export interface EvaluationReport {
  generatedAt: string
  trainRows: number
  validationRows: number
  testRows: number
  partitions: { train: TemporalPartition; validation: TemporalPartition; test: TemporalPartition }
  split: TemporalSplitStrategyReport
  metrics: EvaluationMetric[]
  ignoredMarkets: IgnoredMarket[]
  trace: EvaluationTrace
  drift: DriftReport
  performanceDrift: PerformanceDriftReport
  promotion: PromotionDecision
}

export interface BacktestReport {
  generatedAt: string
  initialWindow: number
  evaluatedRows: number
  metrics: EvaluationMetric[]
  ignoredPredictions: number
  period: { from: string; to: string }
  trace: EvaluationTrace
  drift: DriftReport
  /** Duração do backtest incremental em milissegundos (ETAPA 16). */
  durationMs: number
}

export interface PromotionDecision {
  decision: 'promote' | 'reject' | 'hold'
  reasons: string[]
  evaluatedMarkets: number
  candidateMeanBrier?: number
  championMeanBrier?: number
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
  homeTeamExternalId?: string
  awayTeamExternalId?: string
  sourceProvider: string
  updatedAt: string
  normalizedStatus?: string
  freshness?: 'current' | 'stale' | 'missing_timestamp'
  freshUntil?: string
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
  storage: 'postgresql'
  datasetVersionId: string | null
  fixtures: number
  resultRows: number
  acceptedRows: number
  rejectedRows: number
  duplicateRows: number
  correctedResults: number
  usedApiFootball: boolean
  usedFootballData: boolean
  usedFootballDataOrg: boolean
  simulated: boolean
  importIssues: Array<{ source: string; row: number | string; code: string; message: string }>
  warnings: string[]
}
