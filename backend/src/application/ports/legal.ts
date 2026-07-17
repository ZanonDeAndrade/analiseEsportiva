import type { ActorContext } from './identity.js'

export const legalDocumentTypes = [
  'terms',
  'privacy',
  'risk',
  'refund',
  'acceptable_use',
  'responsible_gaming',
] as const

export type LegalDocumentType = (typeof legalDocumentTypes)[number]

export const legalAcceptancePurposes = [
  'signup',
  'first_access',
  'material_update',
  'subscription',
  'age_confirmation',
  'marketing',
] as const

export type LegalAcceptancePurpose = (typeof legalAcceptancePurposes)[number]

export interface LegalDocumentRecord {
  id: string
  type: LegalDocumentType
  version: string
  title: string
  contentHash: string
  publishedAt?: string
  effectiveAt?: string
  documentUrl: string
  acceptanceGroup: string
  changeKind: 'material' | 'non_material'
  changeSummary: string
  isActive: boolean
  createdAt: string
}

export interface LegalAcceptanceRecord {
  id: string
  evidenceEventId: string
  userId: string
  organizationId: string
  legalDocumentId: string
  documentType: LegalDocumentType
  documentVersion: string
  acceptanceGroup: string
  acceptancePurpose: LegalAcceptancePurpose
  acceptedAt: string
  contentHash: string
  documentUrl: string
  evidenceMetadata: Record<string, unknown>
  revokedAt?: string
}

export interface LegalAcceptanceInput {
  purpose: LegalAcceptancePurpose
  idempotencyKey: string
  documents: Array<{
    type: LegalDocumentType
    version: string
    contentHash: string
  }>
  declarations: {
    age18: boolean
    termsAndPrivacy: boolean
    risk: boolean
    recurringBilling?: boolean
  }
  evidence: {
    origin: 'signup' | 'first_access' | 'material_update' | 'subscription'
    ipHash?: string
    userAgent?: string
    planKey?: string
    billingCycle?: 'month' | 'year'
    priceMinor?: number
    currency?: string
    transactionId?: string
    riskVersion: string
    privacyVersion: string
  }
}

export interface LegalAcceptanceStatus {
  requiresAcceptance: boolean
  requiredDocuments: LegalDocumentRecord[]
  missingDocumentTypes: LegalDocumentType[]
  acceptedAt?: string
}

export interface LegalRepository {
  listDocuments(type?: LegalDocumentType): Promise<LegalDocumentRecord[]>
  acceptanceStatus(actor: ActorContext): Promise<LegalAcceptanceStatus>
  recordAcceptances(
    actor: ActorContext,
    input: LegalAcceptanceInput,
  ): Promise<LegalAcceptanceRecord[]>
  listAcceptances(actor: ActorContext): Promise<LegalAcceptanceRecord[]>
  findAcceptance(actor: ActorContext, id: string): Promise<LegalAcceptanceRecord | null>
}
