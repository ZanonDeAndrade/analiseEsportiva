import type { ActorContext } from './identity.js'

export interface SubjectDataExport {
  schemaVersion: '1.0'
  generatedAt: string
  validUntil: string
  subject: Record<string, unknown>
  organizations: Array<Record<string, unknown>>
  sessions: Array<Record<string, unknown>>
  legalAcceptances: Array<Record<string, unknown>>
  savedQueries: Array<Record<string, unknown>>
  alerts: Array<Record<string, unknown>>
  supportTickets: Array<Record<string, unknown>>
  exports: Array<Record<string, unknown>>
  jobs: Array<Record<string, unknown>>
  auditTrail: Array<Record<string, unknown>>
  retentionNotices: string[]
}

export interface ErasurePlan {
  organizationIds: string[]
  objectKeys: string[]
}

export interface RetentionPurgeResult {
  sessions: number
  invitations: number
  exports: number
  supportTickets: number
  incidents: number
  jobs: number
}

export interface PrivacyRepository {
  exportSubjectData(actor: ActorContext): Promise<SubjectDataExport>
  planUserErasure(actor: ActorContext, replacementOwnerUserId?: string): Promise<ErasurePlan>
  eraseUserActiveData(actor: ActorContext): Promise<void>
  planOrganizationErasure(actor: ActorContext): Promise<ErasurePlan>
  eraseOrganizationActiveData(actor: ActorContext): Promise<void>
  expiredObjectKeys(now: string): Promise<string[]>
  purgeExpired(now: string): Promise<RetentionPurgeResult>
}

export interface PrivateObjectStorage {
  deleteObject(key: string): Promise<void>
}

export interface PrivateCachePurger {
  purgeUser(userId: string): Promise<void>
  purgeOrganization(organizationId: string): Promise<void>
}
