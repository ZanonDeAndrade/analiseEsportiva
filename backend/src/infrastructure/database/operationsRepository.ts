import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { AesGcmFieldCipher, EncryptedField } from '../../application/fieldEncryption.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type {
  AuditEntry,
  IncidentRecord,
  OperationsOwner,
  OperationsRepository,
  SupportSeverity,
  SupportStatus,
  SupportTicket,
} from '../../application/ports/operations.js'
import type { BetIntelDatabase } from './client.js'
import { auditLog, incidents, supportTickets } from './schema.js'
import { applyActorContext } from './tenantContext.js'

export class PostgresOperationsRepository implements OperationsRepository {
  constructor(private readonly db: BetIntelDatabase, private readonly cipher: AesGcmFieldCipher) {}

  async createSupportTicket(
    actor: ActorContext,
    input: Parameters<OperationsRepository['createSupportTicket']>[1],
  ): Promise<SupportTicket> {
    const id = randomUUID()
    const encrypted = this.cipher.encrypt(JSON.stringify({ subject: input.subject, description: input.description }), `support:${id}`)
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const inserted = await tx.insert(supportTickets).values({
        id,
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        category: input.category,
        severity: input.severity,
        ownerTeam: ownerForCategory(input.category),
        encryptedContent: encrypted.ciphertext,
        contentIv: encrypted.iv,
        contentAuthTag: encrypted.authTag,
        encryptionKeyVersion: encrypted.keyVersion,
        slaDueAt: new Date(Date.now() + responseSlaMs(input.severity)).toISOString(),
      }).returning()
      const row = inserted[0]
      if (!row) throw new Error('Falha ao criar chamado.')
      await tx.insert(auditLog).values(audit(actor, 'support.ticket_created', 'support_ticket', id, {
        category: input.category, severity: input.severity, ownerTeam: row.ownerTeam,
      }))
      return this.supportTicket(row)
    })
  }

  async listOwnSupportTickets(actor: ActorContext): Promise<SupportTicket[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx.select().from(supportTickets).where(and(
        eq(supportTickets.organizationId, actor.organizationId),
        eq(supportTickets.createdByUserId, actor.userId),
      )).orderBy(desc(supportTickets.createdAt))
      return rows.map((row) => this.supportTicket(row))
    })
  }

  async listSupportTickets(actor: ActorContext): Promise<SupportTicket[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx.select().from(supportTickets)
        .where(eq(supportTickets.organizationId, actor.organizationId))
        .orderBy(desc(supportTickets.createdAt))
      await tx.insert(auditLog).values(audit(actor, 'support.tickets_accessed', 'support_ticket', undefined, { count: rows.length }))
      return rows.map((row) => this.supportTicket(row))
    })
  }

  async updateSupportTicket(
    actor: ActorContext,
    id: string,
    input: { status: SupportStatus; ownerTeam: OperationsOwner },
  ): Promise<SupportTicket | null> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const updated = await tx.update(supportTickets).set({
        status: input.status,
        ownerTeam: input.ownerTeam,
        resolvedAt: input.status === 'resolved' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      }).where(and(eq(supportTickets.id, id), eq(supportTickets.organizationId, actor.organizationId))).returning()
      const row = updated[0]
      if (!row) return null
      await tx.insert(auditLog).values(audit(actor, 'support.ticket_updated', 'support_ticket', id, input))
      return this.supportTicket(row)
    })
  }

  async listAudit(actor: ActorContext, limit: number): Promise<AuditEntry[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await tx.insert(auditLog).values(audit(actor, 'audit.accessed', 'audit_log', undefined, { limit }))
      const rows = await tx.select().from(auditLog)
        .where(eq(auditLog.organizationId, actor.organizationId))
        .orderBy(desc(auditLog.createdAt)).limit(limit)
      return rows.map((row) => ({
        id: row.id, action: row.action, targetType: row.targetType,
        targetId: row.targetId ?? undefined, requestId: row.requestId ?? undefined,
        metadata: row.metadata, createdAt: row.createdAt,
      }))
    })
  }

  async listIncidents(actor: ActorContext): Promise<IncidentRecord[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx.select().from(incidents)
        .where(eq(incidents.organizationId, actor.organizationId))
        .orderBy(desc(incidents.startedAt))
      await tx.insert(auditLog).values(audit(actor, 'incident.records_accessed', 'incident', undefined, { count: rows.length }))
      return rows.map((row) => this.incident(row))
    })
  }

  async createIncident(
    actor: ActorContext,
    input: Parameters<OperationsRepository['createIncident']>[1],
  ): Promise<IncidentRecord> {
    const id = randomUUID()
    const encrypted = this.cipher.encrypt(JSON.stringify({ title: input.title, summary: input.summary }), `incident:${id}`)
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const inserted = await tx.insert(incidents).values({
        id, organizationId: actor.organizationId, createdByUserId: actor.userId,
        severity: input.severity, ownerTeam: input.ownerTeam,
        encryptedContent: encrypted.ciphertext, contentIv: encrypted.iv,
        contentAuthTag: encrypted.authTag, encryptionKeyVersion: encrypted.keyVersion,
        publicReference: input.publicReference,
      }).returning()
      const row = inserted[0]
      if (!row) throw new Error('Falha ao registrar incidente.')
      await tx.insert(auditLog).values(audit(actor, 'incident.created', 'incident', id, {
        severity: input.severity, ownerTeam: input.ownerTeam, publicReference: input.publicReference,
      }))
      return this.incident(row)
    })
  }

  async updateIncident(
    actor: ActorContext,
    id: string,
    input: Parameters<OperationsRepository['updateIncident']>[2],
  ): Promise<IncidentRecord | null> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const current = await tx.select().from(incidents).where(and(
        eq(incidents.id, id), eq(incidents.organizationId, actor.organizationId),
      )).limit(1)
      if (!current[0]) return null
      const decoded = this.decode(current[0], `incident:${id}`) as { title: string }
      const encrypted = this.cipher.encrypt(JSON.stringify({ title: decoded.title, summary: input.summary }), `incident:${id}`)
      const updated = await tx.update(incidents).set({
        status: input.status, ownerTeam: input.ownerTeam, publicReference: input.publicReference,
        encryptedContent: encrypted.ciphertext, contentIv: encrypted.iv,
        contentAuthTag: encrypted.authTag, encryptionKeyVersion: encrypted.keyVersion,
        resolvedAt: input.status === 'resolved' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      }).where(eq(incidents.id, id)).returning()
      await tx.insert(auditLog).values(audit(actor, 'incident.updated', 'incident', id, {
        status: input.status, ownerTeam: input.ownerTeam, publicReference: input.publicReference,
      }))
      return this.incident(updated[0])
    })
  }

  private supportTicket(row: typeof supportTickets.$inferSelect): SupportTicket {
    const content = this.decode(row, `support:${row.id}`) as { subject: string; description: string }
    return {
      id: row.id, category: row.category as SupportTicket['category'], severity: row.severity as SupportSeverity,
      status: row.status as SupportStatus, ownerTeam: row.ownerTeam as OperationsOwner,
      subject: content.subject, description: content.description, slaDueAt: row.slaDueAt,
      createdAt: row.createdAt, updatedAt: row.updatedAt, resolvedAt: row.resolvedAt ?? undefined,
    }
  }

  private incident(row: typeof incidents.$inferSelect | undefined): IncidentRecord {
    if (!row) throw new Error('Incidente nao persistido.')
    const content = this.decode(row, `incident:${row.id}`) as { title: string; summary: string }
    return {
      id: row.id, severity: row.severity as SupportSeverity, status: row.status as IncidentRecord['status'],
      ownerTeam: row.ownerTeam as OperationsOwner, title: content.title, summary: content.summary,
      publicReference: row.publicReference ?? undefined, startedAt: row.startedAt,
      resolvedAt: row.resolvedAt ?? undefined, createdAt: row.createdAt, updatedAt: row.updatedAt,
    }
  }

  private decode(row: { encryptedContent: string; contentIv: string; contentAuthTag: string; encryptionKeyVersion: string }, context: string) {
    const encrypted: EncryptedField = {
      ciphertext: row.encryptedContent, iv: row.contentIv,
      authTag: row.contentAuthTag, keyVersion: row.encryptionKeyVersion,
    }
    return JSON.parse(this.cipher.decrypt(encrypted, context)) as unknown
  }
}

function responseSlaMs(severity: SupportSeverity) {
  return ({ sev1: 15 * 60_000, sev2: 60 * 60_000, sev3: 8 * 60 * 60_000, sev4: 48 * 60 * 60_000 })[severity]
}

function ownerForCategory(category: string): OperationsOwner {
  if (category === 'security') return 'security'
  if (category === 'billing') return 'billing'
  if (category === 'privacy') return 'privacy'
  if (category === 'data' || category === 'technical') return 'engineering'
  return 'support'
}

function audit(actor: ActorContext, action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}) {
  return {
    scope: 'organization' as const, organizationId: actor.organizationId,
    actorUserId: actor.userId, action, targetType, targetId,
    requestId: actor.requestId, metadata,
  }
}
