export interface VerifiedIdentity {
  provider: 'auth0'
  subject: string
  sessionId: string
  issuedAt: string
  expiresAt: string
  authenticatedAt?: string
}

export interface ProviderUser {
  subject: string
  email?: string
  emailVerified: boolean
  displayName?: string
  updatedAt?: string
  blocked: boolean
}

export interface ProviderSession {
  id: string
  createdAt?: string
  authenticatedAt?: string
  expiresAt?: string
  lastSeenAt?: string
  userAgent?: string
  current?: boolean
}

export interface IdentityProvider {
  verifyAccessToken(token: string): Promise<VerifiedIdentity>
  getUser(subject: string): Promise<ProviderUser>
  listSessions(subject: string): Promise<ProviderSession[]>
  revokeSession(sessionId: string): Promise<void>
  revokeAllSessions(subject: string): Promise<void>
  requestEmailChange(subject: string, newEmail: string): Promise<void>
  blockUser(subject: string): Promise<void>
  deleteUser(subject: string): Promise<void>
}

import type { MembershipRole } from '../authorization.js'

export type { MembershipRole } from '../authorization.js'

export interface ActorContext {
  userId: string
  organizationId: string
  role: MembershipRole
  provider: 'auth0'
  subject: string
  sessionId: string
  tokenExpiresAt: string
  authenticatedAt?: string
  requestId?: string
  platformAdmin?: boolean
}

export interface IdentityRequestMetadata {
  userAgent?: string
  ipHash?: string
  requestId?: string
}

export interface LocalSession {
  id: string
  providerSessionId: string
  lastSeenAt: string
  expiresAt: string
  authenticatedAt?: string
  userAgent?: string
  revokedAt?: string
  current: boolean
}

export interface IdentityRepository {
  resolveActor(
    identity: VerifiedIdentity,
    metadata: IdentityRequestMetadata,
    profile?: ProviderUser,
  ): Promise<ActorContext>
  listSessions(actor: ActorContext): Promise<LocalSession[]>
  revokeSession(actor: ActorContext, providerSessionId: string, reason: string): Promise<boolean>
  revokeAllSessions(actor: ActorContext, reason: string): Promise<void>
  markEmailChangePending(actor: ActorContext): Promise<void>
  blockUser(actor: ActorContext, reason: string): Promise<void>
  deactivateAccount(actor: ActorContext, replacementOwnerUserId?: string): Promise<void>
  prepareAccountDeletion(actor: ActorContext, replacementOwnerUserId?: string): Promise<void>
  syncProfile(actor: ActorContext, profile: ProviderUser): Promise<void>
}
