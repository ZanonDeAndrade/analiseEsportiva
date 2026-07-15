import type {
  BacktestReport,
  BetIntelModel,
  CompetitionSummary,
  CsvRow,
  EvaluationReport,
  FixtureRecord,
} from '../../schemas.js'
import type { IdentityRepository } from './identity.js'
import type { OrganizationRepository } from './organizations.js'
import type { InternalJobStore, JobQueue } from './jobs.js'

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
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'unknown'
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
  readTrainingRows(): Promise<CsvRow[]>
  previewImport(batch: SportsImportBatch): Promise<{
    datasetVersionId: string | null
    existingRecords: number
  }>
  importBatch(batch: SportsImportBatch): Promise<SportsImportResult>
}

export interface ModelRepository {
  getActiveModel(): Promise<BetIntelModel | null>
  saveModel(
    model: BetIntelModel,
    datasetVersionId?: string,
    sourceJobId?: string,
  ): Promise<{ id: string; version: number }>
  getLatestEvaluation(kind: 'evaluation'): Promise<EvaluationReport | null>
  getLatestEvaluation(kind: 'backtest'): Promise<BacktestReport | null>
  saveEvaluation(kind: 'evaluation', report: EvaluationReport, sourceJobId?: string, modelVersionId?: string): Promise<void>
  saveEvaluation(kind: 'backtest', report: BacktestReport, sourceJobId?: string, modelVersionId?: string): Promise<void>
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
}
