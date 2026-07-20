import type {
  BacktestReport,
  BetIntelModel,
  CompetitionSummary,
  CsvRow,
  EvaluationReport,
  FixtureRecord,
  PromotionDecision,
} from '../../schemas.js'
import type { IdentityRepository } from './identity.js'
import type { OrganizationRepository } from './organizations.js'
import type { InternalJobStore, JobQueue } from './jobs.js'
import type { LegalRepository } from './legal.js'
import type { WorkspaceRepository } from './workspace.js'
import type { OperationsRepository } from './operations.js'
import type { PrivacyRepository } from './privacy.js'
import type { FixtureLifecycleStatus, MatchDecision } from '../../domain/sportsData.js'
import type { BillingRepository } from './billing.js'

export interface FixtureQuery {
  competition?: string
  from?: string
  to?: string
  includePast?: boolean
}

export interface NormalizedSportsRecord {
  sourceProvider: string
  externalId: string
  competitionExternalId: string
  competitionName: string
  leagueName: string
  seasonExternalId?: string
  seasonLabel?: string
  startsAt: string
  status: FixtureLifecycleStatus
  rawStatus?: string
  round?: string
  sourceUpdatedAt?: string
  homeTeam: {
    externalId: string
    name: string
    alias: string
    normalizedAlias: string
  }
  awayTeam: {
    externalId: string
    name: string
    alias: string
    normalizedAlias: string
  }
  result?: {
    homeGoals: number
    awayGoals: number
    outcome: 'H' | 'D' | 'A'
    decision: MatchDecision
    winner: 'home' | 'away' | 'draw' | 'undetermined'
    homeExtraTimeGoals?: number
    awayExtraTimeGoals?: number
    homePenaltyGoals?: number
    awayPenaltyGoals?: number
  }
  stats?: {
    homeCorners?: number
    awayCorners?: number
    homeYellowCards?: number
    awayYellowCards?: number
    homeRedCards?: number
    awayRedCards?: number
  }
}

export interface SportsImportBatch {
  datasetKey: string
  contentSha256: string
  records: NormalizedSportsRecord[]
  rejectedRows: number
  duplicateRows: number
  ambiguousRows: number
  issues?: SportsImportIssue[]
  providerPolicies?: Array<{
    provider: string
    policyReference: string
    licenseReference: string
  }>
}

export interface SportsImportIssue {
  source: string
  row: number | string
  code: string
  message: string
  payload?: Record<string, unknown>
}

export interface DataQualityIssue {
  id: string
  issueType: string
  sourceProvider: string
  externalId?: string
  status: 'open' | 'resolved' | 'rejected'
  message: string
  payload: Record<string, unknown>
  resolution?: Record<string, unknown>
  createdAt: string
  resolvedAt?: string
}

export interface AliasReview {
  id: string
  sourceProvider: string
  alias: string
  normalizedAlias: string
  teamId: string
  canonicalName: string
  reviewStatus: 'auto_accepted' | 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt?: string
}

export interface DataFreshnessSummary {
  current: number
  stale: number
  missingTimestamp: number
  oldestSourceTimestamp?: string
  newestSourceTimestamp?: string
  checkedAt: string
}

export interface SportsImportResult {
  datasetVersionId: string | null
  accepted: number
  inserted: number
  duplicates: number
  correctedResults: number
  alreadyImported: boolean
}

export interface SportsRepository {
  listFixtures(query?: FixtureQuery): Promise<FixtureRecord[]>
  findFixture(id: string | number): Promise<FixtureRecord | null>
  listCompetitions(): Promise<CompetitionSummary[]>
  readTrainingRows(datasetVersionId?: string): Promise<CsvRow[]>
  previewImport(batch: SportsImportBatch): Promise<{
    datasetVersionId: string | null
    existingRecords: number
  }>
  importBatch(batch: SportsImportBatch): Promise<SportsImportResult>
  listDataQualityIssues(status?: 'open' | 'resolved' | 'rejected'): Promise<DataQualityIssue[]>
  resolveDataQualityIssue(id: string, resolution: Record<string, unknown>): Promise<boolean>
  listAliasReviews(status?: AliasReview['reviewStatus']): Promise<AliasReview[]>
  reviewAlias(id: string, status: 'approved' | 'rejected'): Promise<boolean>
  dataFreshnessSummary(): Promise<DataFreshnessSummary>
}

export interface ModelRepository {
  getActiveModel(): Promise<(BetIntelModel & { modelVersionId: string; datasetVersionId: string }) | null>
  saveModel(
    model: BetIntelModel,
    datasetVersionId?: string,
    sourceJobId?: string,
  ): Promise<{ id: string; version: number }>
  getLatestEvaluation(kind: 'evaluation'): Promise<EvaluationReport | null>
  getLatestEvaluation(kind: 'backtest'): Promise<BacktestReport | null>
  getChampionEvaluation(): Promise<EvaluationReport | null>
  saveEvaluation(kind: 'evaluation', report: EvaluationReport, sourceJobId?: string, modelVersionId?: string): Promise<void>
  saveEvaluation(kind: 'backtest', report: BacktestReport, sourceJobId?: string, modelVersionId?: string): Promise<void>
  applyPromotionDecision(modelVersionId: string, decision: PromotionDecision, sourceJobId?: string): Promise<void>
  rollbackModel(modelVersionId: string, reason: string, sourceJobId?: string): Promise<boolean>
  listModelVersions(): Promise<Array<{
    id: string
    version: number
    status: string
    datasetVersionId: string
    codeVersion: string
    featureSetVersion: string
    artifactFingerprint: string
    trainedAt: string
    activatedAt?: string
  }>>
}

export interface SystemStateRepository {
  get<T extends Record<string, unknown>>(key: string): Promise<T | null>
  set(key: string, value: Record<string, unknown>): Promise<void>
}

export interface PersistenceRepositories {
  sports: SportsRepository
  models: ModelRepository
  systemState: SystemStateRepository
  identity: IdentityRepository
  organizations: OrganizationRepository
  jobs: JobQueue & InternalJobStore
  legal: LegalRepository
  workspace: WorkspaceRepository
  operations: OperationsRepository
  privacy: PrivacyRepository
  billing: BillingRepository
}
