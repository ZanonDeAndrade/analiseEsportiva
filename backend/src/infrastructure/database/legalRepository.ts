import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { IdentityError } from '../../application/identityErrors.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type {
  LegalAcceptanceInput,
  LegalAcceptanceRecord,
  LegalAcceptanceStatus,
  LegalDocumentRecord,
  LegalDocumentType,
  LegalRepository,
} from '../../application/ports/legal.js'
import type { BetIntelDatabase } from './client.js'
import { legalAcceptances, legalDocuments } from './schema.js'
import { applyActorContext } from './tenantContext.js'

const requiredDocumentTypes: LegalDocumentType[] = ['terms', 'privacy', 'risk']

export class PostgresLegalRepository implements LegalRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async listDocuments(type?: LegalDocumentType): Promise<LegalDocumentRecord[]> {
    const rows = await this.db
      .select()
      .from(legalDocuments)
      .where(type ? eq(legalDocuments.type, type) : undefined)
      .orderBy(desc(legalDocuments.createdAt))
    return rows.map(mapDocument)
  }

  async acceptanceStatus(actor: ActorContext): Promise<LegalAcceptanceStatus> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const documentRows = await tx
        .select()
        .from(legalDocuments)
        .where(and(
          eq(legalDocuments.isActive, true),
          inArray(legalDocuments.type, requiredDocumentTypes),
        ))
      const requiredDocuments = documentRows.map(mapDocument)

      if (requiredDocuments.length !== requiredDocumentTypes.length) {
        throw new IdentityError(
          'legal_documents_unavailable',
          'Os documentos jurídicos obrigatórios ainda não foram publicados no servidor.',
          503,
        )
      }

      const acceptanceRows = await tx
        .select({
          type: legalAcceptances.documentType,
          acceptanceGroup: legalAcceptances.acceptanceGroup,
          acceptedAt: legalAcceptances.acceptedAt,
        })
        .from(legalAcceptances)
        .where(and(
          eq(legalAcceptances.userId, actor.userId),
          eq(legalAcceptances.organizationId, actor.organizationId),
          isNull(legalAcceptances.revokedAt),
          inArray(legalAcceptances.documentType, requiredDocumentTypes),
        ))

      const missingDocumentTypes = findMissingDocumentTypes(requiredDocuments, acceptanceRows)
      const acceptedAt = acceptanceRows
        .map((row) => row.acceptedAt)
        .sort()
        .at(-1)

      return {
        requiresAcceptance: missingDocumentTypes.length > 0,
        requiredDocuments,
        missingDocumentTypes,
        acceptedAt,
      }
    })
  }

  async recordAcceptances(
    actor: ActorContext,
    input: LegalAcceptanceInput,
  ): Promise<LegalAcceptanceRecord[]> {
    validateAcceptanceInput(input)
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const types = [...new Set(input.documents.map((document) => document.type))]
      const activeDocuments = await tx
        .select()
        .from(legalDocuments)
        .where(and(eq(legalDocuments.isActive, true), inArray(legalDocuments.type, types)))

      if (activeDocuments.length !== types.length) {
        throw invalidAcceptance('Um ou mais documentos não estão ativos no servidor.')
      }
      for (const submitted of input.documents) {
        const active = activeDocuments.find((document) => document.type === submitted.type)
        if (!active
          || active.version !== submitted.version
          || active.contentHash !== submitted.contentHash) {
          throw invalidAcceptance('A versão ou o hash do documento mudou. Recarregue e leia a versão atual.')
        }
      }

      const evidenceEventId = randomUUID()
      const evidenceMetadata = compactEvidence(input)
      const inserted = await tx
        .insert(legalAcceptances)
        .values(activeDocuments.map((document) => ({
          evidenceEventId,
          idempotencyKey: input.idempotencyKey,
          userId: actor.userId,
          organizationId: actor.organizationId,
          legalDocumentId: document.id,
          documentType: document.type,
          documentVersion: document.version,
          acceptanceGroup: document.acceptanceGroup,
          acceptancePurpose: input.purpose,
          ipHash: input.evidence.ipHash,
          userAgent: input.evidence.userAgent?.slice(0, 512),
          contentHash: document.contentHash,
          documentUrl: document.documentUrl,
          evidenceMetadata,
        })))
        .onConflictDoNothing()
        .returning()

      if (inserted.length === activeDocuments.length) return inserted.map(mapAcceptance)

      const existing = await tx
        .select()
        .from(legalAcceptances)
        .where(and(
          eq(legalAcceptances.userId, actor.userId),
          eq(legalAcceptances.organizationId, actor.organizationId),
          eq(legalAcceptances.idempotencyKey, input.idempotencyKey),
          inArray(legalAcceptances.legalDocumentId, activeDocuments.map((document) => document.id)),
        ))
      if (existing.length !== activeDocuments.length) {
        throw new IdentityError(
          'legal_acceptance_failed',
          'Não foi possível persistir toda a evidência do aceite.',
          503,
        )
      }
      return existing.map(mapAcceptance)
    })
  }

  async listAcceptances(actor: ActorContext): Promise<LegalAcceptanceRecord[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .select()
        .from(legalAcceptances)
        .where(and(
          eq(legalAcceptances.userId, actor.userId),
          eq(legalAcceptances.organizationId, actor.organizationId),
        ))
        .orderBy(desc(legalAcceptances.acceptedAt))
      return rows.map(mapAcceptance)
    })
  }

  async findAcceptance(actor: ActorContext, id: string): Promise<LegalAcceptanceRecord | null> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .select()
        .from(legalAcceptances)
        .where(and(
          eq(legalAcceptances.id, id),
          eq(legalAcceptances.userId, actor.userId),
          eq(legalAcceptances.organizationId, actor.organizationId),
        ))
        .limit(1)
      return rows[0] ? mapAcceptance(rows[0]) : null
    })
  }
}

export function findMissingDocumentTypes(
  requiredDocuments: Array<Pick<LegalDocumentRecord, 'type' | 'acceptanceGroup'>>,
  acceptances: Array<{ type: LegalDocumentType; acceptanceGroup: string }>,
) {
  return requiredDocuments
    .filter((document) => !acceptances.some(
      (acceptance) => acceptance.type === document.type
        && acceptance.acceptanceGroup === document.acceptanceGroup,
    ))
    .map((document) => document.type)
}

function validateAcceptanceInput(input: LegalAcceptanceInput) {
  if (!input.declarations.age18 || !input.declarations.termsAndPrivacy || !input.declarations.risk) {
    throw invalidAcceptance('As declarações obrigatórias devem ser aceitas expressamente.')
  }
  const submitted = new Set(input.documents.map((document) => document.type))
  if (!requiredDocumentTypes.every((type) => submitted.has(type))) {
    throw invalidAcceptance('Termos, Política de Privacidade e Aviso de Risco são obrigatórios.')
  }
  if (input.purpose === 'subscription') {
    if (!input.declarations.recurringBilling) {
      throw invalidAcceptance('A cobrança recorrente exige autorização específica.')
    }
    if (!input.evidence.planKey || !input.evidence.billingCycle
      || input.evidence.priceMinor === undefined || !input.evidence.currency) {
      throw invalidAcceptance('O aceite da assinatura exige plano, ciclo, preço e moeda resolvidos no servidor.')
    }
  }
}

function compactEvidence(input: LegalAcceptanceInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    origin: input.evidence.origin,
    ageDeclared: input.declarations.age18,
    termsAndPrivacyAccepted: input.declarations.termsAndPrivacy,
    riskAccepted: input.declarations.risk,
    recurringBillingAccepted: input.declarations.recurringBilling,
    planKey: input.evidence.planKey,
    billingCycle: input.evidence.billingCycle,
    priceMinor: input.evidence.priceMinor,
    currency: input.evidence.currency,
    transactionId: input.evidence.transactionId,
    riskVersion: input.evidence.riskVersion,
    privacyVersion: input.evidence.privacyVersion,
  }).filter(([, value]) => value !== undefined))
}

function invalidAcceptance(message: string) {
  return new IdentityError('invalid_legal_acceptance', message, 409)
}

function mapDocument(row: typeof legalDocuments.$inferSelect): LegalDocumentRecord {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    title: row.title,
    contentHash: row.contentHash,
    publishedAt: row.publishedAt ?? undefined,
    effectiveAt: row.effectiveAt ?? undefined,
    documentUrl: row.documentUrl,
    acceptanceGroup: row.acceptanceGroup,
    changeKind: row.changeKind,
    changeSummary: row.changeSummary,
    isActive: row.isActive,
    createdAt: row.createdAt,
  }
}

function mapAcceptance(row: typeof legalAcceptances.$inferSelect): LegalAcceptanceRecord {
  return {
    id: row.id,
    evidenceEventId: row.evidenceEventId,
    userId: row.userId,
    organizationId: row.organizationId,
    legalDocumentId: row.legalDocumentId,
    documentType: row.documentType,
    documentVersion: row.documentVersion,
    acceptanceGroup: row.acceptanceGroup,
    acceptancePurpose: row.acceptancePurpose,
    acceptedAt: row.acceptedAt,
    contentHash: row.contentHash,
    documentUrl: row.documentUrl,
    evidenceMetadata: row.evidenceMetadata,
    revokedAt: row.revokedAt ?? undefined,
  }
}
