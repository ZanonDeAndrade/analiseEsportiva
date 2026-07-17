import { createHash } from 'node:crypto'
import { and, desc, eq, isNotNull, ne, or, sql } from 'drizzle-orm'
import { IdentityError } from '../../application/identityErrors.js'
import type { AesGcmFieldCipher, EncryptedField } from '../../application/fieldEncryption.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type {
  ErasurePlan,
  PrivacyRepository,
  RetentionPurgeResult,
  SubjectDataExport,
} from '../../application/ports/privacy.js'
import type { BetIntelDatabase } from './client.js'
import {
  alertRules,
  apiKeys,
  auditLog,
  backgroundJobs,
  exportsTable,
  incidents,
  invitations,
  legalAcceptances,
  memberships,
  organizations,
  predictions,
  savedQueries,
  sessionMetadata,
  supportTickets,
  users,
} from './schema.js'
import { applyActorContext, applyOrganizationContext } from './tenantContext.js'

export class PostgresPrivacyRepository implements PrivacyRepository {
  constructor(private readonly db: BetIntelDatabase, private readonly cipher: AesGcmFieldCipher) {}

  async exportSubjectData(actor: ActorContext): Promise<SubjectDataExport> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const subject = (await tx.select({
        id: users.id, identityProvider: users.identityProvider, email: users.email,
        emailVerified: users.emailVerified, displayName: users.displayName, status: users.status,
        createdAt: users.createdAt, updatedAt: users.updatedAt,
      }).from(users).where(eq(users.id, actor.userId)).limit(1))[0] ?? {}
      const memberRows = await tx.select({
        organizationId: memberships.organizationId, role: memberships.role,
        status: memberships.status, joinedAt: memberships.createdAt,
      }).from(memberships).where(eq(memberships.userId, actor.userId))

      const sessions: Array<Record<string, unknown>> = []
      const acceptances: Array<Record<string, unknown>> = []
      const queries: Array<Record<string, unknown>> = []
      const alerts: Array<Record<string, unknown>> = []
      const tickets: Array<Record<string, unknown>> = []
      const exportRows: Array<Record<string, unknown>> = []
      const jobs: Array<Record<string, unknown>> = []
      const audits: Array<Record<string, unknown>> = []

      await tx.insert(auditLog).values(audit(actor, 'privacy.subject_exported', 'user', actor.userId, {
        organizationCount: memberRows.length,
      }))

      for (const membership of memberRows) {
        await applyOrganizationContext(tx, membership.organizationId)
        sessions.push(...await tx.select({
          organizationId: sessionMetadata.organizationId, providerSessionId: sessionMetadata.providerSessionId,
          lastSeenAt: sessionMetadata.lastSeenAt, expiresAt: sessionMetadata.expiresAt,
          authenticatedAt: sessionMetadata.authenticatedAt, userAgent: sessionMetadata.userAgent,
          revokedAt: sessionMetadata.revokedAt, revokedReason: sessionMetadata.revokedReason,
          createdAt: sessionMetadata.createdAt,
        }).from(sessionMetadata).where(and(
          eq(sessionMetadata.organizationId, membership.organizationId),
          eq(sessionMetadata.userId, actor.userId),
        )))
        acceptances.push(...await tx.select({
          organizationId: legalAcceptances.organizationId, documentType: legalAcceptances.documentType,
          documentVersion: legalAcceptances.documentVersion, acceptancePurpose: legalAcceptances.acceptancePurpose,
          acceptedAt: legalAcceptances.acceptedAt, contentHash: legalAcceptances.contentHash,
          documentUrl: legalAcceptances.documentUrl, revokedAt: legalAcceptances.revokedAt,
        }).from(legalAcceptances).where(and(
          eq(legalAcceptances.organizationId, membership.organizationId),
          eq(legalAcceptances.userId, actor.userId),
        )))
        queries.push(...await tx.select({
          organizationId: savedQueries.organizationId, id: savedQueries.id, name: savedQueries.name,
          filters: savedQueries.filters, createdAt: savedQueries.createdAt, updatedAt: savedQueries.updatedAt,
        }).from(savedQueries).where(and(
          eq(savedQueries.organizationId, membership.organizationId),
          eq(savedQueries.createdByUserId, actor.userId),
        )))
        alerts.push(...await tx.select({
          organizationId: alertRules.organizationId, id: alertRules.id, name: alertRules.name,
          channel: alertRules.channel, status: alertRules.status, deliveryState: alertRules.deliveryState,
          createdAt: alertRules.createdAt, updatedAt: alertRules.updatedAt,
        }).from(alertRules).where(and(
          eq(alertRules.organizationId, membership.organizationId),
          eq(alertRules.createdByUserId, actor.userId),
        )))
        const ticketRows = await tx.select().from(supportTickets).where(and(
          eq(supportTickets.organizationId, membership.organizationId),
          eq(supportTickets.createdByUserId, actor.userId),
        ))
        tickets.push(...ticketRows.map((row) => {
          const content = this.decryptContent(row, `support:${row.id}`)
          return {
            id: row.id, organizationId: row.organizationId, category: row.category,
            severity: row.severity, status: row.status, ownerTeam: row.ownerTeam,
            ...content, slaDueAt: row.slaDueAt, createdAt: row.createdAt,
            updatedAt: row.updatedAt, resolvedAt: row.resolvedAt,
          }
        }))
        exportRows.push(...await tx.select({
          organizationId: exportsTable.organizationId, id: exportsTable.id, type: exportsTable.type,
          status: exportsTable.status, contentSha256: exportsTable.contentSha256,
          sizeBytes: exportsTable.sizeBytes, expiresAt: exportsTable.expiresAt,
          createdAt: exportsTable.createdAt,
        }).from(exportsTable).where(and(
          eq(exportsTable.organizationId, membership.organizationId),
          eq(exportsTable.requestedByUserId, actor.userId),
        )))
        jobs.push(...await tx.select({
          organizationId: backgroundJobs.organizationId, id: backgroundJobs.id,
          type: backgroundJobs.jobType, status: backgroundJobs.status,
          createdAt: backgroundJobs.createdAt, completedAt: backgroundJobs.completedAt,
          failureCode: backgroundJobs.failureCode,
        }).from(backgroundJobs).where(and(
          eq(backgroundJobs.organizationId, membership.organizationId),
          eq(backgroundJobs.requestedByUserId, actor.userId),
        )))
        audits.push(...await tx.select({
          organizationId: auditLog.organizationId, action: auditLog.action,
          targetType: auditLog.targetType, targetId: auditLog.targetId,
          requestId: auditLog.requestId, metadata: auditLog.metadata, createdAt: auditLog.createdAt,
        }).from(auditLog).where(and(
          eq(auditLog.organizationId, membership.organizationId),
          eq(auditLog.actorUserId, actor.userId),
        )).orderBy(desc(auditLog.createdAt)))
      }

      const generatedAt = new Date().toISOString()
      return {
        schemaVersion: '1.0', generatedAt,
        validUntil: new Date(Date.now() + 5 * 60_000).toISOString(), subject,
        organizations: memberRows, sessions, legalAcceptances: acceptances,
        savedQueries: queries, alerts, supportTickets: tickets, exports: exportRows,
        jobs, auditTrail: audits,
        retentionNotices: [
          'Registros de billing seguem retencao fiscal/contabil ainda sujeita a validacao profissional.',
          'Aceites e trilhas de auditoria podem permanecer pseudonimizados para obrigacao legal, seguranca e exercicio regular de direitos; prazo exige revisao juridica.',
          'O provedor de identidade atende dados que administra diretamente em fluxo proprio.',
        ],
      }
    })
  }

  async planUserErasure(actor: ActorContext, replacementOwnerUserId?: string): Promise<ErasurePlan> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const memberRows = await tx.select({
        organizationId: memberships.organizationId, role: memberships.role, status: memberships.status,
      })
        .from(memberships).where(eq(memberships.userId, actor.userId))
      const objectKeys: string[] = []
      for (const membership of memberRows) {
        await applyOrganizationContext(tx, membership.organizationId)
        if (membership.status === 'active' && membership.role === 'owner') {
          const others = await tx.select({ userId: memberships.userId }).from(memberships).where(and(
            eq(memberships.organizationId, membership.organizationId),
            eq(memberships.status, 'active'), ne(memberships.userId, actor.userId),
          ))
          if (others.length > 0 && (!replacementOwnerUserId || !others.some((row) => row.userId === replacementOwnerUserId))) {
            throw new IdentityError('ownership_transfer_required', 'Transfira a propriedade para um membro ativo antes de excluir a conta.', 409)
          }
        }
        const rows = await tx.select({ objectKey: exportsTable.objectKey }).from(exportsTable).where(and(
          eq(exportsTable.organizationId, membership.organizationId),
          eq(exportsTable.requestedByUserId, actor.userId), isNotNull(exportsTable.objectKey),
        ))
        objectKeys.push(...rows.flatMap((row) => row.objectKey ? [row.objectKey] : []))
      }
      return { organizationIds: memberRows.map((row) => row.organizationId), objectKeys }
    })
  }

  async eraseUserActiveData(actor: ActorContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const user = (await tx.select({ email: users.emailNormalized }).from(users)
        .where(eq(users.id, actor.userId)).limit(1))[0]
      const memberRows = await tx.select({ organizationId: memberships.organizationId })
        .from(memberships).where(eq(memberships.userId, actor.userId))
      for (const membership of memberRows) {
        await applyOrganizationContext(tx, membership.organizationId)
        await tx.delete(alertRules).where(and(eq(alertRules.organizationId, membership.organizationId), eq(alertRules.createdByUserId, actor.userId)))
        await tx.delete(savedQueries).where(and(eq(savedQueries.organizationId, membership.organizationId), eq(savedQueries.createdByUserId, actor.userId)))
        await tx.delete(supportTickets).where(and(eq(supportTickets.organizationId, membership.organizationId), eq(supportTickets.createdByUserId, actor.userId)))
        await tx.delete(exportsTable).where(and(eq(exportsTable.organizationId, membership.organizationId), eq(exportsTable.requestedByUserId, actor.userId)))
        await tx.delete(sessionMetadata).where(and(eq(sessionMetadata.organizationId, membership.organizationId), eq(sessionMetadata.userId, actor.userId)))
        const personalInvitation = user?.email
          ? or(eq(invitations.emailNormalized, user.email), eq(invitations.acceptedByUserId, actor.userId))
          : eq(invitations.acceptedByUserId, actor.userId)
        await tx.delete(invitations).where(and(
          eq(invitations.organizationId, membership.organizationId), personalInvitation,
        ))
        await tx.insert(auditLog).values(audit({ ...actor, organizationId: membership.organizationId }, 'privacy.user_active_data_erased', 'user', actor.userId))
      }
    })
  }

  async planOrganizationErasure(actor: ActorContext): Promise<ErasurePlan> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx.select({ objectKey: exportsTable.objectKey }).from(exportsTable).where(and(
        eq(exportsTable.organizationId, actor.organizationId), isNotNull(exportsTable.objectKey),
      ))
      return {
        organizationIds: [actor.organizationId],
        objectKeys: rows.flatMap((row) => row.objectKey ? [row.objectKey] : []),
      }
    })
  }

  async eraseOrganizationActiveData(actor: ActorContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await tx.insert(auditLog).values(audit(actor, 'privacy.organization_active_data_erased', 'organization', actor.organizationId, {
        retained: ['billing', 'legal_acceptances', 'audit_log'],
      }))
      await tx.delete(alertRules).where(eq(alertRules.organizationId, actor.organizationId))
      await tx.delete(savedQueries).where(eq(savedQueries.organizationId, actor.organizationId))
      await tx.delete(supportTickets).where(eq(supportTickets.organizationId, actor.organizationId))
      await tx.delete(incidents).where(eq(incidents.organizationId, actor.organizationId))
      await tx.delete(exportsTable).where(eq(exportsTable.organizationId, actor.organizationId))
      await tx.delete(invitations).where(eq(invitations.organizationId, actor.organizationId))
      await tx.delete(apiKeys).where(eq(apiKeys.organizationId, actor.organizationId))
      await tx.delete(predictions).where(eq(predictions.organizationId, actor.organizationId))
      await tx.delete(sessionMetadata).where(eq(sessionMetadata.organizationId, actor.organizationId))
      await tx.update(backgroundJobs).set({ payload: {}, resultMetadata: {}, cancelRequestedAt: new Date().toISOString() })
        .where(eq(backgroundJobs.organizationId, actor.organizationId))
      await tx.update(memberships).set({ status: 'revoked' }).where(eq(memberships.organizationId, actor.organizationId))
      const suffix = createHash('sha256').update(actor.organizationId).digest('hex').slice(0, 16)
      await tx.update(organizations).set({
        status: 'closed', name: `Organizacao excluida ${suffix.slice(0, 6)}`,
        slug: `deleted-${suffix}`, updatedAt: new Date().toISOString(),
      }).where(eq(organizations.id, actor.organizationId))
    })
  }

  async expiredObjectKeys(now: string): Promise<string[]> {
    const result = await this.db.execute<{ object_key: string }>(
      sql`select object_key from ops.expired_export_object_keys(${now}::timestamptz)`,
    )
    return result.rows.map((row) => row.object_key)
  }

  async purgeExpired(now: string): Promise<RetentionPurgeResult> {
    const result = await this.db.execute<{ result: RetentionPurgeResult }>(
      sql`select ops.purge_expired_private_data(${now}::timestamptz) as result`,
    )
    const row = result.rows[0]
    if (!row) throw new Error('Job de retencao nao retornou resultado.')
    return row.result
  }

  private decryptContent(row: { encryptedContent: string; contentIv: string; contentAuthTag: string; encryptionKeyVersion: string }, context: string) {
    const encrypted: EncryptedField = {
      ciphertext: row.encryptedContent, iv: row.contentIv,
      authTag: row.contentAuthTag, keyVersion: row.encryptionKeyVersion,
    }
    return JSON.parse(this.cipher.decrypt(encrypted, context)) as Record<string, unknown>
  }
}

function audit(actor: ActorContext, action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}) {
  return {
    scope: 'organization' as const, organizationId: actor.organizationId, actorUserId: actor.userId,
    action, targetType, targetId, requestId: actor.requestId, metadata,
  }
}
