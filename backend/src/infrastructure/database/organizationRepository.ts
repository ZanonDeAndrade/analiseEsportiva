import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { IdentityError } from '../../application/identityErrors.js'
import { MembershipRoles, type MembershipRole } from '../../application/authorization.js'
import type { ActorContext } from '../../application/ports/identity.js'
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRepository,
  OrganizationSummary,
} from '../../application/ports/organizations.js'
import type { BetIntelDatabase } from './client.js'
import {
  apiKeys,
  auditLog,
  invitations,
  memberships,
  organizations,
  sessionMetadata,
  users,
} from './schema.js'
import {
  applyActorContext,
  applyIdentityContext,
  applyOrganizationContext,
  type DatabaseTransaction,
} from './tenantContext.js'

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async listOrganizations(actor: ActorContext): Promise<OrganizationSummary[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(
          and(
            eq(memberships.userId, actor.userId),
            eq(memberships.status, 'active'),
            eq(organizations.status, 'active'),
          ),
        )
        .orderBy(asc(organizations.name))
      return rows.map((row) => ({ ...row, active: row.id === actor.organizationId }))
    })
  }

  async createOrganization(actor: ActorContext, name: string, slug: string) {
    try {
      return await this.db.transaction(async (tx) => {
        await applyIdentityContext(tx, actor.userId)
        const organizationId = randomUUID()
        await applyOrganizationContext(tx, organizationId)
        await tx.insert(organizations).values({ id: organizationId, name, slug })
        await tx.insert(memberships).values({
          organizationId,
          userId: actor.userId,
          role: MembershipRoles.OWNER,
        })
        await tx
          .update(sessionMetadata)
          .set({ organizationId })
          .where(
            and(
              eq(sessionMetadata.userId, actor.userId),
              eq(sessionMetadata.providerSessionId, actor.sessionId),
              isNull(sessionMetadata.revokedAt),
            ),
          )
        await organizationAudit(tx, actor, organizationId, 'organization.created', 'organization', organizationId, null, {
          name,
          slug,
          role: MembershipRoles.OWNER,
        })
        return { id: organizationId, name, slug, role: MembershipRoles.OWNER, active: true }
      })
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new IdentityError('invalid_request', 'Slug de organização indisponível.', 409)
      }
      throw error
    }
  }

  async switchOrganization(actor: ActorContext, organizationId: string) {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .select({ name: organizations.name, slug: organizations.slug, role: memberships.role })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(
          and(
            eq(memberships.userId, actor.userId),
            eq(memberships.organizationId, organizationId),
            eq(memberships.status, 'active'),
            eq(organizations.status, 'active'),
          ),
        )
        .limit(1)
      const membership = rows[0]
      if (!membership) throw new IdentityError('not_found', 'Organização não encontrada.', 404)

      await applyOrganizationContext(tx, organizationId)
      const updated = await tx
        .update(sessionMetadata)
        .set({ organizationId })
        .where(
          and(
            eq(sessionMetadata.userId, actor.userId),
            eq(sessionMetadata.providerSessionId, actor.sessionId),
            isNull(sessionMetadata.revokedAt),
          ),
        )
        .returning({ id: sessionMetadata.id })
      if (updated.length !== 1) throw new IdentityError('session_revoked', 'Sessão revogada.', 401)

      await organizationAudit(tx, actor, organizationId, 'organization.switched', 'session', actor.sessionId, {
        organizationId: actor.organizationId,
      }, { organizationId })
      return { id: organizationId, ...membership, active: true }
    })
  }

  async listMembers(actor: ActorContext): Promise<OrganizationMember[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      return tx
        .select({
          userId: memberships.userId,
          displayName: users.displayName,
          role: memberships.role,
          status: memberships.status,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, actor.organizationId))
        .orderBy(asc(memberships.createdAt))
        .then((rows) => rows.map((row) => ({ ...row, displayName: row.displayName ?? undefined })))
    })
  }

  async listInvitations(actor: ActorContext): Promise<OrganizationInvitation[]> {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .select({
          id: invitations.id,
          emailNormalized: invitations.emailNormalized,
          role: invitations.role,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
        })
        .from(invitations)
        .where(eq(invitations.organizationId, actor.organizationId))
        .orderBy(asc(invitations.createdAt))
      const now = Date.now()
      return rows.map(({ emailNormalized, ...row }) => ({
        ...row,
        emailMasked: maskEmail(emailNormalized),
        status:
          row.status === 'pending' && Date.parse(row.expiresAt) <= now ? 'expired' : row.status,
      }))
    })
  }

  async createInvitation(
    actor: ActorContext,
    input: { emailNormalized: string; role: MembershipRole; tokenHash: string; expiresAt: string },
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        await applyActorContext(tx, actor)
        const existing = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.organizationId, actor.organizationId),
              eq(memberships.status, 'active'),
              eq(users.emailNormalized, input.emailNormalized),
            ),
          )
          .limit(1)
        if (existing[0]) throw new IdentityError('invalid_request', 'Usuário já é membro.', 409)

        const inserted = await tx
          .insert(invitations)
          .values({
            organizationId: actor.organizationId,
            invitedByUserId: actor.userId,
            ...input,
          })
          .returning({
            id: invitations.id,
            role: invitations.role,
            status: invitations.status,
            expiresAt: invitations.expiresAt,
            createdAt: invitations.createdAt,
          })
        const invitation = inserted[0]
        await organizationAudit(tx, actor, actor.organizationId, 'invitation.created', 'invitation', invitation.id, null, {
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        })
        return { ...invitation, emailMasked: maskEmail(input.emailNormalized) }
      })
    } catch (error) {
      if (error instanceof IdentityError) throw error
      if (postgresCode(error) === '23505') {
        throw new IdentityError('invalid_request', 'Já existe convite pendente para este e-mail.', 409)
      }
      throw error
    }
  }

  async acceptInvitation(actor: ActorContext, tokenHash: string) {
    return this.db.transaction(async (tx) => {
      const userRows = await tx
        .select({ emailNormalized: users.emailNormalized })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1)
      const emailNormalized = userRows[0]?.emailNormalized
      if (!emailNormalized) throw new IdentityError('forbidden', 'E-mail verificado necessário.', 403)
      await applyIdentityContext(tx, actor.userId, emailNormalized)

      const rows = await tx
        .select({
          id: invitations.id,
          organizationId: invitations.organizationId,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.tokenHash, tokenHash),
            eq(invitations.emailNormalized, emailNormalized),
            eq(invitations.status, 'pending'),
            gt(invitations.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1)
      const invitation = rows[0]
      if (!invitation) throw new IdentityError('invalid_request', 'Convite inválido ou expirado.', 400)

      await applyOrganizationContext(tx, invitation.organizationId)
      const accepted = await tx
        .update(invitations)
        .set({
          status: 'accepted',
          acceptedByUserId: actor.userId,
          acceptedAt: new Date().toISOString(),
        })
        .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
        .returning({ id: invitations.id })
      if (accepted.length !== 1) {
        throw new IdentityError('invalid_request', 'Convite inválido ou já utilizado.', 400)
      }
      await tx
        .insert(memberships)
        .values({
          organizationId: invitation.organizationId,
          userId: actor.userId,
          role: invitation.role,
        })
        .onConflictDoUpdate({
          target: [memberships.organizationId, memberships.userId],
          set: { role: invitation.role, status: 'active' },
        })
      const organizationRows = await tx
        .select({ name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, invitation.organizationId),
            eq(organizations.status, 'active'),
          ),
        )
        .limit(1)
      const organization = organizationRows[0]
      if (!organization) throw new IdentityError('not_found', 'Organização não encontrada.', 404)
      await tx
        .update(sessionMetadata)
        .set({ organizationId: invitation.organizationId })
        .where(
          and(
            eq(sessionMetadata.userId, actor.userId),
            eq(sessionMetadata.providerSessionId, actor.sessionId),
            isNull(sessionMetadata.revokedAt),
          ),
        )
      await organizationAudit(tx, actor, invitation.organizationId, 'invitation.accepted', 'invitation', invitation.id, {
        status: 'pending',
      }, { status: 'accepted', role: invitation.role })
      return {
        id: invitation.organizationId,
        name: organization.name,
        slug: organization.slug,
        role: invitation.role,
        active: true,
      }
    })
  }

  async revokeInvitation(actor: ActorContext, invitationId: string) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const changed = await tx
        .update(invitations)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.organizationId, actor.organizationId),
            eq(invitations.status, 'pending'),
          ),
        )
        .returning({ id: invitations.id, role: invitations.role, expiresAt: invitations.expiresAt })
      if (!changed[0]) throw new IdentityError('not_found', 'Convite não encontrado.', 404)
      await organizationAudit(tx, actor, actor.organizationId, 'invitation.revoked', 'invitation', invitationId, {
        status: 'pending',
        role: changed[0].role,
        expiresAt: changed[0].expiresAt,
      }, { status: 'revoked', role: changed[0].role })
    })
  }

  async changeMemberRole(actor: ActorContext, memberUserId: string, role: MembershipRole) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const target = await activeMember(tx, actor.organizationId, memberUserId)
      if (
        !target ||
        target.role === MembershipRoles.OWNER ||
        (actor.role === MembershipRoles.ADMIN && target.role === MembershipRoles.ADMIN)
      ) {
        throw new IdentityError('not_found', 'Membro não encontrado.', 404)
      }
      await tx
        .update(memberships)
        .set({ role })
        .where(eq(memberships.id, target.id))
      await organizationAudit(tx, actor, actor.organizationId, 'membership.role_changed', 'membership', target.id, {
        role: target.role,
        status: target.status,
      }, { role, status: target.status })
    })
  }

  async removeMember(actor: ActorContext, memberUserId: string) {
    return this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const target = await activeMember(tx, actor.organizationId, memberUserId)
      if (
        !target ||
        target.role === MembershipRoles.OWNER ||
        (actor.role === MembershipRoles.ADMIN && target.role === MembershipRoles.ADMIN)
      ) {
        throw new IdentityError('not_found', 'Membro não encontrado.', 404)
      }
      const providerRows = await tx
        .select({ providerSubject: users.providerSubject })
        .from(users)
        .where(eq(users.id, memberUserId))
        .limit(1)
      if (!providerRows[0]) throw new IdentityError('not_found', 'Membro não encontrado.', 404)

      await tx.update(memberships).set({ status: 'revoked' }).where(eq(memberships.id, target.id))
      const now = new Date().toISOString()
      await tx
        .update(sessionMetadata)
        .set({ revokedAt: now, revokedReason: 'membership_removed' })
        .where(
          and(
            eq(sessionMetadata.userId, memberUserId),
            eq(sessionMetadata.organizationId, actor.organizationId),
            isNull(sessionMetadata.revokedAt),
          ),
        )
      await tx
        .update(apiKeys)
        .set({ status: 'revoked', revokedAt: now })
        .where(
          and(
            eq(apiKeys.organizationId, actor.organizationId),
            eq(apiKeys.createdByUserId, memberUserId),
            eq(apiKeys.status, 'active'),
          ),
        )
      await organizationAudit(tx, actor, actor.organizationId, 'membership.removed', 'membership', target.id, {
        role: target.role,
        status: 'active',
      }, { role: target.role, status: 'revoked', accessRevoked: true })
      return providerRows[0]
    })
  }

  async transferOwnership(actor: ActorContext, memberUserId: string) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const currentOwner = await activeMember(tx, actor.organizationId, actor.userId)
      const nextOwner = await activeMember(tx, actor.organizationId, memberUserId)
      if (!currentOwner || currentOwner.role !== MembershipRoles.OWNER) {
        throw new IdentityError('forbidden', 'Somente o proprietário pode transferir a organização.', 403)
      }
      if (!nextOwner || nextOwner.role === MembershipRoles.OWNER) {
        throw new IdentityError('not_found', 'Membro não encontrado.', 404)
      }
      await tx
        .update(memberships)
        .set({ role: MembershipRoles.ADMIN })
        .where(eq(memberships.id, currentOwner.id))
      await tx
        .update(memberships)
        .set({ role: MembershipRoles.OWNER })
        .where(eq(memberships.id, nextOwner.id))
      await organizationAudit(tx, actor, actor.organizationId, 'organization.ownership_transferred', 'organization', actor.organizationId, {
        ownerUserId: actor.userId,
        previousOwnerRole: MembershipRoles.OWNER,
        nextOwnerPreviousRole: nextOwner.role,
      }, {
        ownerUserId: memberUserId,
        previousOwnerRole: MembershipRoles.ADMIN,
        nextOwnerRole: MembershipRoles.OWNER,
      })
    })
  }
}

async function activeMember(tx: DatabaseTransaction, organizationId: string, userId: string) {
  const rows = await tx
    .select({ id: memberships.id, role: memberships.role, status: memberships.status })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1)
  return rows[0]
}

async function organizationAudit(
  tx: DatabaseTransaction,
  actor: ActorContext,
  organizationId: string,
  action: string,
  targetType: string,
  targetId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await tx.insert(auditLog).values({
    scope: 'organization',
    organizationId,
    actorUserId: actor.userId,
    action,
    targetType,
    targetId,
    requestId: actor.requestId,
    metadata: { before, after },
  })
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

function postgresCode(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } }
  return value.code ?? value.cause?.code
}
