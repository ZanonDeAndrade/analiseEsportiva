import type { ActorContext } from './identity.js'
import type { MembershipRole } from '../authorization.js'

export interface OrganizationSummary {
  id: string
  slug: string
  name: string
  role: MembershipRole
  active: boolean
}

export interface OrganizationMember {
  userId: string
  displayName?: string
  role: MembershipRole
  status: 'active' | 'suspended' | 'revoked'
  joinedAt: string
}

export interface OrganizationInvitation {
  id: string
  emailMasked: string
  role: MembershipRole
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: string
  createdAt: string
}

export interface CreatedInvitation extends OrganizationInvitation {
  token: string
}

export interface RemovedMemberIdentity {
  providerSubject: string
}

export interface OrganizationRepository {
  listOrganizations(actor: ActorContext): Promise<OrganizationSummary[]>
  createOrganization(actor: ActorContext, name: string, slug: string): Promise<OrganizationSummary>
  switchOrganization(actor: ActorContext, organizationId: string): Promise<OrganizationSummary>
  listMembers(actor: ActorContext): Promise<OrganizationMember[]>
  listInvitations(actor: ActorContext): Promise<OrganizationInvitation[]>
  createInvitation(
    actor: ActorContext,
    input: { emailNormalized: string; role: MembershipRole; tokenHash: string; expiresAt: string },
  ): Promise<Omit<CreatedInvitation, 'token'>>
  acceptInvitation(actor: ActorContext, tokenHash: string): Promise<OrganizationSummary>
  revokeInvitation(actor: ActorContext, invitationId: string): Promise<void>
  changeMemberRole(
    actor: ActorContext,
    memberUserId: string,
    role: MembershipRole,
  ): Promise<void>
  removeMember(actor: ActorContext, memberUserId: string): Promise<RemovedMemberIdentity>
  transferOwnership(actor: ActorContext, memberUserId: string): Promise<void>
}
