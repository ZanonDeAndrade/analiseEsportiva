import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm'
import { IdentityError } from '../../application/identityErrors.js'
import { MembershipRoles } from '../../application/authorization.js'
import type {
  ActorContext,
  IdentityRepository,
  IdentityRequestMetadata,
  LocalSession,
  ProviderUser,
  VerifiedIdentity,
} from '../../application/ports/identity.js'
import type { BetIntelDatabase } from './client.js'
import {
  apiKeys,
  auditLog,
  memberships,
  organizations,
  sessionMetadata,
  users,
} from './schema.js'
import {
  applyActorContext,
  applyIdentityContext,
  applyOrganizationContext,
  type DatabaseTransaction as Transaction,
} from './tenantContext.js'

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async resolveActor(
    identity: VerifiedIdentity,
    metadata: IdentityRequestMetadata,
    profile?: ProviderUser,
  ): Promise<ActorContext> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${identity.provider}:${identity.subject}`}, 0))`)

      let user = await findUser(tx, identity.provider, identity.subject)
      let created = false

      if (!user) {
        if (!profile || profile.subject !== identity.subject) {
          throw new IdentityError(
            'identity_not_provisioned',
            'Identidade local ainda não sincronizada.',
            401,
          )
        }

        const inserted = await tx
          .insert(users)
          .values({
            identityProvider: identity.provider,
            providerSubject: identity.subject,
            email: profile.email,
            emailNormalized: profile.email?.trim().toLowerCase(),
            emailVerified: profile.emailVerified,
            displayName: profile.displayName,
            providerUpdatedAt: profile.updatedAt,
          })
          .returning({ id: users.id })
        created = inserted.length === 1
        user = await findUser(tx, identity.provider, identity.subject)
      } else if (profile) {
        await updateProfile(tx, user.id, profile)
        user = await findUser(tx, identity.provider, identity.subject)
      }

      if (!user) throw new IdentityError('invalid_token', 'Identidade inválida.', 401)
      if (user.status !== 'active' || user.deletedAt) {
        throw new IdentityError('user_disabled', 'Acesso indisponível.', 403)
      }
      if (!user.emailVerified) {
        throw new IdentityError(
          'email_verification_required',
          'Confirme o e-mail no Auth0 antes de acessar.',
          403,
        )
      }

      await applyIdentityContext(tx, user.id, user.emailNormalized)

      const existingSession = await tx
        .select({
          userId: sessionMetadata.userId,
          organizationId: sessionMetadata.organizationId,
          revokedAt: sessionMetadata.revokedAt,
        })
        .from(sessionMetadata)
        .where(
          and(
            eq(sessionMetadata.identityProvider, identity.provider),
            eq(sessionMetadata.providerSessionId, identity.sessionId),
          ),
        )
        .limit(1)

      if (existingSession[0]?.userId && existingSession[0].userId !== user.id) {
        throw new IdentityError('invalid_token', 'Sessão inválida.', 401)
      }
      if (existingSession[0]?.revokedAt) {
        throw new IdentityError('session_revoked', 'Sessão revogada.', 401)
      }

      let membership = await findActiveMembership(
        tx,
        user.id,
        existingSession[0]?.organizationId,
      )
      if (!membership && created) {
        membership = await createPersonalOrganization(tx, user.id, identity)
      }
      if (!membership) {
        throw new IdentityError('membership_required', 'Associação organizacional ativa necessária.', 403)
      }

      await applyOrganizationContext(tx, membership.organizationId)

      await tx
        .insert(sessionMetadata)
        .values({
          userId: user.id,
          organizationId: membership.organizationId,
          identityProvider: identity.provider,
          providerSessionId: identity.sessionId,
          lastSeenAt: new Date().toISOString(),
          expiresAt: identity.expiresAt,
          authenticatedAt: identity.authenticatedAt,
          userAgent: sanitizeUserAgent(metadata.userAgent),
          ipHash: metadata.ipHash,
        })
        .onConflictDoUpdate({
          target: [sessionMetadata.identityProvider, sessionMetadata.providerSessionId],
          set: {
            organizationId: membership.organizationId,
            lastSeenAt: new Date().toISOString(),
            expiresAt: identity.expiresAt,
            authenticatedAt: identity.authenticatedAt,
            userAgent: sanitizeUserAgent(metadata.userAgent),
            ipHash: metadata.ipHash,
          },
        })

      if (!existingSession[0]) {
        await tx.insert(auditLog).values({
          scope: 'organization',
          organizationId: membership.organizationId,
          actorUserId: user.id,
          action: created ? 'identity.user_provisioned' : 'identity.session_started',
          targetType: 'session',
          targetId: identity.sessionId,
          requestId: metadata.requestId,
          metadata: { provider: identity.provider },
        })
      }

      return {
        userId: user.id,
        organizationId: membership.organizationId,
        role: membership.role,
        provider: identity.provider,
        subject: identity.subject,
        sessionId: identity.sessionId,
        tokenExpiresAt: identity.expiresAt,
        authenticatedAt: identity.authenticatedAt,
        requestId: metadata.requestId,
      }
    })
  }

  async listSessions(actor: ActorContext): Promise<LocalSession[]> {
    const rows = await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      return tx
        .select()
        .from(sessionMetadata)
        .where(eq(sessionMetadata.userId, actor.userId))
        .orderBy(asc(sessionMetadata.createdAt))
    })

    return rows.map((row) => ({
      id: row.id,
      providerSessionId: row.providerSessionId,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      authenticatedAt: row.authenticatedAt ?? undefined,
      userAgent: row.userAgent ?? undefined,
      revokedAt: row.revokedAt ?? undefined,
      current: row.providerSessionId === actor.sessionId,
    }))
  }

  async revokeSession(actor: ActorContext, providerSessionId: string, reason: string) {
    const revoked = await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      const rows = await tx
        .update(sessionMetadata)
        .set({ revokedAt: new Date().toISOString(), revokedReason: reason })
        .where(
          and(
            eq(sessionMetadata.userId, actor.userId),
            eq(sessionMetadata.providerSessionId, providerSessionId),
            isNull(sessionMetadata.revokedAt),
          ),
        )
        .returning({ id: sessionMetadata.id })
      if (rows.length === 0) return false

      await tx.insert(auditLog).values({
        scope: 'organization',
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'identity.session_revoked',
        targetType: 'session',
        targetId: providerSessionId,
        metadata: { reason },
      })
      return true
    })
    return revoked
  }

  async revokeAllSessions(actor: ActorContext, reason: string) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await revokeLocalAccess(tx, actor.userId, reason)
      await applyOrganizationContext(tx, actor.organizationId)
      await tx.insert(auditLog).values({
        scope: 'organization',
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'identity.sessions_revoked_all',
        targetType: 'user',
        targetId: actor.userId,
        metadata: { reason },
      })
    })
  }

  async markEmailChangePending(actor: ActorContext) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await tx.update(users).set({ emailVerified: false }).where(eq(users.id, actor.userId))
    })
  }

  async blockUser(actor: ActorContext, reason: string) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await tx
        .update(users)
        .set({ status: 'disabled', disabledAt: new Date().toISOString() })
        .where(eq(users.id, actor.userId))
      await revokeLocalAccess(tx, actor.userId, reason)
      await applyOrganizationContext(tx, actor.organizationId)
      await tx.insert(auditLog).values({
        scope: 'organization',
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'identity.user_blocked',
        targetType: 'user',
        targetId: actor.userId,
        metadata: { reason },
      })
    })
  }

  async deactivateAccount(actor: ActorContext, replacementOwnerUserId?: string) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await transferAndRevokeMemberships(tx, actor, replacementOwnerUserId)
      await tx
        .update(users)
        .set({ status: 'disabled', disabledAt: new Date().toISOString() })
        .where(eq(users.id, actor.userId))
      await revokeLocalAccess(tx, actor.userId, 'account_deactivated')
      await writeAccountAudit(tx, actor, 'identity.account_deactivated')
    })
  }

  async prepareAccountDeletion(actor: ActorContext, replacementOwnerUserId?: string) {
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await transferAndRevokeMemberships(tx, actor, replacementOwnerUserId)
      const now = new Date().toISOString()
      await tx
        .update(users)
        .set({
          status: 'disabled',
          disabledAt: now,
          deletedAt: now,
          email: null,
          emailNormalized: null,
          emailVerified: false,
          displayName: null,
        })
        .where(eq(users.id, actor.userId))
      await revokeLocalAccess(tx, actor.userId, 'account_deleted')
      await writeAccountAudit(tx, actor, 'identity.account_deleted')
    })
  }

  async syncProfile(actor: ActorContext, profile: ProviderUser) {
    if (profile.subject !== actor.subject) {
      throw new IdentityError('invalid_token', 'Identidade inválida.', 401)
    }
    await this.db.transaction(async (tx) => {
      await applyActorContext(tx, actor)
      await updateProfile(tx, actor.userId, profile)
      await tx.insert(auditLog).values({
        scope: 'organization',
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'identity.profile_synchronized',
        targetType: 'user',
        targetId: actor.userId,
        metadata: { provider: actor.provider, emailVerified: profile.emailVerified },
      })
    })
  }
}

async function findUser(tx: Transaction, provider: string, subject: string) {
  const rows = await tx
    .select({
      id: users.id,
      status: users.status,
      emailVerified: users.emailVerified,
      emailNormalized: users.emailNormalized,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.identityProvider, provider), eq(users.providerSubject, subject)))
    .limit(1)
  return rows[0]
}

async function updateProfile(tx: Transaction, userId: string, profile: ProviderUser) {
  await tx
    .update(users)
    .set({
      email: profile.email,
      emailNormalized: profile.email?.trim().toLowerCase(),
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
      providerUpdatedAt: profile.updatedAt,
      lastIdentitySyncAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
}

async function findActiveMembership(
  tx: Transaction,
  userId: string,
  preferredOrganizationId?: string,
) {
  const rows = await tx
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
        eq(organizations.status, 'active'),
      ),
    )
    .orderBy(asc(memberships.createdAt))
  return rows.find((row) => row.organizationId === preferredOrganizationId) ?? rows[0]
}

async function createPersonalOrganization(
  tx: Transaction,
  userId: string,
  identity: VerifiedIdentity,
) {
  const slug = `personal-${createHash('sha256')
    .update(`${identity.provider}:${identity.subject}`)
    .digest('hex')
    .slice(0, 20)}`
  const organizationId = randomUUID()
  await applyOrganizationContext(tx, organizationId)
  const orgRows = await tx
    .insert(organizations)
    .values({ id: organizationId, slug, name: 'Organização pessoal' })
    .onConflictDoUpdate({ target: organizations.slug, set: { updatedAt: new Date().toISOString() } })
    .returning({ id: organizations.id })
  const resolvedOrganizationId = orgRows[0].id
  await applyOrganizationContext(tx, resolvedOrganizationId)
  await tx
    .insert(memberships)
    .values({
      organizationId: resolvedOrganizationId,
      userId,
      role: MembershipRoles.OWNER,
    })
    .onConflictDoNothing({ target: [memberships.organizationId, memberships.userId] })
  return { organizationId: resolvedOrganizationId, role: MembershipRoles.OWNER }
}

async function revokeLocalAccess(tx: Transaction, userId: string, reason: string) {
  const now = new Date().toISOString()
  await tx
    .update(sessionMetadata)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(eq(sessionMetadata.userId, userId), isNull(sessionMetadata.revokedAt)))
  const organizationRows = await tx
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
  for (const row of organizationRows) {
    await applyOrganizationContext(tx, row.organizationId)
    await tx
      .update(apiKeys)
      .set({ status: 'revoked', revokedAt: now })
      .where(
        and(
          eq(apiKeys.organizationId, row.organizationId),
          eq(apiKeys.createdByUserId, userId),
          eq(apiKeys.status, 'active'),
        ),
      )
  }
}

async function transferAndRevokeMemberships(
  tx: Transaction,
  actor: ActorContext,
  replacementOwnerUserId?: string,
) {
  const actorMemberships = await tx
    .select({ id: memberships.id, organizationId: memberships.organizationId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, actor.userId), eq(memberships.status, 'active')))

  for (const membership of actorMemberships) {
    await applyOrganizationContext(tx, membership.organizationId)
    if (membership.role === MembershipRoles.OWNER) {
      const others = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, membership.organizationId),
            eq(memberships.status, 'active'),
            ne(memberships.userId, actor.userId),
          ),
        )

      if (others.length > 0) {
        if (!replacementOwnerUserId || !others.some((row) => row.userId === replacementOwnerUserId)) {
          throw new IdentityError(
            'ownership_transfer_required',
            'Transfira a propriedade para um membro ativo antes de excluir a conta.',
            409,
          )
        }
        await tx
          .update(memberships)
          .set({ status: 'revoked' })
          .where(eq(memberships.id, membership.id))
        await tx
          .update(memberships)
          .set({ role: MembershipRoles.OWNER })
          .where(
            and(
              eq(memberships.organizationId, membership.organizationId),
              eq(memberships.userId, replacementOwnerUserId),
              eq(memberships.status, 'active'),
            ),
          )
      } else {
        await tx
          .update(organizations)
          .set({ status: 'closed' })
          .where(eq(organizations.id, membership.organizationId))
      }
    }

    await tx
      .update(memberships)
      .set({ status: 'revoked' })
      .where(eq(memberships.id, membership.id))
  }
}

async function writeAccountAudit(tx: Transaction, actor: ActorContext, action: string) {
  await applyOrganizationContext(tx, actor.organizationId)
  await tx.insert(auditLog).values({
    scope: 'organization',
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action,
    targetType: 'user',
    targetId: actor.userId,
    requestId: actor.requestId,
    metadata: { before: { status: 'active' }, after: { status: 'disabled' } },
  })
}

function sanitizeUserAgent(value: string | undefined) {
  const normalized = value?.replace(/[\r\n]/g, ' ').trim()
  return normalized ? normalized.slice(0, 300) : undefined
}
