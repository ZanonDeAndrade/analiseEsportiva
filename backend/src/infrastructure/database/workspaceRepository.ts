import { and, desc, eq } from 'drizzle-orm'
import { IdentityError } from '../../application/identityErrors.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type {
  AlertRule,
  SavedQuery,
  SavedQueryFilters,
  WorkspaceRepository,
} from '../../application/ports/workspace.js'
import type { BetIntelDatabase } from './client.js'
import { alertRules, auditLog, savedQueries } from './schema.js'
import { applyActorContext } from './tenantContext.js'

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async listSavedQueries(actor: ActorContext): Promise<SavedQuery[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      return tx.select({
        id: savedQueries.id,
        name: savedQueries.name,
        filters: savedQueries.filters,
        createdAt: savedQueries.createdAt,
        updatedAt: savedQueries.updatedAt,
      }).from(savedQueries).where(and(
        eq(savedQueries.organizationId, actor.organizationId),
        eq(savedQueries.createdByUserId, actor.userId),
      )).orderBy(desc(savedQueries.updatedAt))
    })
  }

  async createSavedQuery(actor: ActorContext, name: string, filters: SavedQueryFilters): Promise<SavedQuery> {
    try {
      return await this.db.transaction(async (tx) => {
        await applyActorContext(tx, actor)
        const inserted = await tx.insert(savedQueries).values({
          organizationId: actor.organizationId,
          createdByUserId: actor.userId,
          name,
          filters,
        }).returning({
          id: savedQueries.id,
          name: savedQueries.name,
          filters: savedQueries.filters,
          createdAt: savedQueries.createdAt,
          updatedAt: savedQueries.updatedAt,
        })
        const result = inserted[0]
        if (!result) throw new Error('Falha ao persistir consulta salva.')
        await tx.insert(auditLog).values({
          scope: 'organization', organizationId: actor.organizationId, actorUserId: actor.userId,
          action: 'saved_query.created', targetType: 'saved_query', targetId: result.id,
          metadata: { name },
        })
        return result
      })
    } catch (error) {
      if (postgresCode(error) === '23505') throw new IdentityError('invalid_request', 'Ja existe uma consulta salva com esse nome.', 409)
      throw error
    }
  }

  async deleteSavedQuery(actor: ActorContext, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const deleted = await tx.delete(savedQueries).where(and(
        eq(savedQueries.id, id),
        eq(savedQueries.organizationId, actor.organizationId),
        eq(savedQueries.createdByUserId, actor.userId),
      )).returning({ id: savedQueries.id })
      if (!deleted[0]) return false
      await tx.insert(auditLog).values({
        scope: 'organization', organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'saved_query.deleted', targetType: 'saved_query', targetId: id, metadata: {},
      })
      return true
    })
  }

  async listAlertRules(actor: ActorContext): Promise<AlertRule[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx.select({
        id: alertRules.id,
        name: alertRules.name,
        savedQueryId: alertRules.savedQueryId,
        channel: alertRules.channel,
        status: alertRules.status,
        deliveryState: alertRules.deliveryState,
        createdAt: alertRules.createdAt,
        updatedAt: alertRules.updatedAt,
      }).from(alertRules).where(and(
        eq(alertRules.organizationId, actor.organizationId),
        eq(alertRules.createdByUserId, actor.userId),
      )).orderBy(desc(alertRules.updatedAt))
      return rows.map((row) => ({
        ...row,
        savedQueryId: row.savedQueryId ?? undefined,
        channel: row.channel as AlertRule['channel'],
        status: row.status as AlertRule['status'],
        deliveryState: row.deliveryState as AlertRule['deliveryState'],
      }))
    })
  }

  async createAlertRule(
    actor: ActorContext,
    input: { name: string; savedQueryId?: string; channel: AlertRule['channel'] },
  ): Promise<AlertRule> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      if (input.savedQueryId) {
        const query = await tx.select({ id: savedQueries.id }).from(savedQueries).where(and(
          eq(savedQueries.id, input.savedQueryId),
          eq(savedQueries.organizationId, actor.organizationId),
          eq(savedQueries.createdByUserId, actor.userId),
        )).limit(1)
        if (!query[0]) throw new IdentityError('not_found', 'Consulta salva nao encontrada nesta organizacao.', 404)
      }
      const inserted = await tx.insert(alertRules).values({
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        savedQueryId: input.savedQueryId,
        name: input.name,
        channel: input.channel,
        status: 'paused',
        deliveryState: 'not_configured',
      }).returning({
        id: alertRules.id,
        name: alertRules.name,
        savedQueryId: alertRules.savedQueryId,
        channel: alertRules.channel,
        status: alertRules.status,
        deliveryState: alertRules.deliveryState,
        createdAt: alertRules.createdAt,
        updatedAt: alertRules.updatedAt,
      })
      const result = inserted[0]
      if (!result) throw new Error('Falha ao persistir regra de alerta.')
      await tx.insert(auditLog).values({
        scope: 'organization', organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'alert_rule.created', targetType: 'alert_rule', targetId: result.id,
        metadata: { name: input.name, deliveryState: result.deliveryState },
      })
      return {
        ...result,
        savedQueryId: result.savedQueryId ?? undefined,
        channel: result.channel as AlertRule['channel'],
        status: result.status as AlertRule['status'],
        deliveryState: result.deliveryState as AlertRule['deliveryState'],
      }
    })
  }

  async deleteAlertRule(actor: ActorContext, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const deleted = await tx.delete(alertRules).where(and(
        eq(alertRules.id, id),
        eq(alertRules.organizationId, actor.organizationId),
        eq(alertRules.createdByUserId, actor.userId),
      )).returning({ id: alertRules.id })
      return Boolean(deleted[0])
    })
  }
}

function postgresCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined
}
