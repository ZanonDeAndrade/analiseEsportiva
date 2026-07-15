import { createHash, randomBytes } from 'node:crypto'
import {
  assignableRoles,
  isMembershipRole,
  requirePermission,
  type MembershipRole,
} from './authorization.js'
import { IdentityError } from './identityErrors.js'
import { requireFreshAuthentication } from './identityService.js'
import type { ActorContext, IdentityProvider } from './ports/identity.js'
import type { OrganizationRepository } from './ports/organizations.js'

export class OrganizationService {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  listOrganizations(actor: ActorContext) {
    requirePermission(actor.role, 'organization.read')
    return this.repository.listOrganizations(actor)
  }

  createOrganization(actor: ActorContext, input: { name?: string; slug?: string }) {
    requirePermission(actor.role, 'organization.create')
    const name = organizationName(input.name)
    return this.repository.createOrganization(actor, name, organizationSlug(input.slug, name))
  }

  switchOrganization(actor: ActorContext, organizationId: string) {
    requirePermission(actor.role, 'organization.switch')
    requireUuid(organizationId, 'Organização inválida.')
    return this.repository.switchOrganization(actor, organizationId)
  }

  listMembers(actor: ActorContext) {
    requirePermission(actor.role, 'members.read')
    return this.repository.listMembers(actor)
  }

  listInvitations(actor: ActorContext) {
    requirePermission(actor.role, 'members.invite')
    return this.repository.listInvitations(actor)
  }

  async invite(
    actor: ActorContext,
    input: { email?: string; role?: unknown; expiresInHours?: number },
  ) {
    requirePermission(actor.role, 'members.invite')
    const emailNormalized = normalizeEmail(input.email)
    const role = requestedAssignableRole(actor.role, input.role)
    const expiresInHours = input.expiresInHours ?? 72
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) {
      throw new IdentityError('invalid_request', 'Expiração deve ficar entre 1 e 168 horas.', 400)
    }
    const token = `bti_${randomBytes(32).toString('base64url')}`
    const invitation = await this.repository.createInvitation(actor, {
      emailNormalized,
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + expiresInHours * 3_600_000).toISOString(),
    })
    return { ...invitation, token }
  }

  acceptInvitation(actor: ActorContext, token: string) {
    if (!/^bti_[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new IdentityError('invalid_request', 'Convite inválido ou expirado.', 400)
    }
    return this.repository.acceptInvitation(actor, hashToken(token))
  }

  revokeInvitation(actor: ActorContext, invitationId: string) {
    requirePermission(actor.role, 'members.invite')
    requireUuid(invitationId, 'Convite inválido.')
    return this.repository.revokeInvitation(actor, invitationId)
  }

  changeRole(actor: ActorContext, memberUserId: string, requestedRole: unknown) {
    requirePermission(actor.role, 'members.change_role')
    requireUuid(memberUserId, 'Membro inválido.')
    const role = requestedAssignableRole(actor.role, requestedRole)
    if (memberUserId === actor.userId) {
      throw new IdentityError('invalid_request', 'Use transferência de propriedade para alterar o owner.', 409)
    }
    return this.repository.changeMemberRole(actor, memberUserId, role)
  }

  async removeMember(actor: ActorContext, memberUserId: string) {
    requirePermission(actor.role, 'members.remove')
    requireUuid(memberUserId, 'Membro inválido.')
    if (memberUserId === actor.userId) {
      throw new IdentityError('invalid_request', 'O proprietário não pode remover a si mesmo.', 409)
    }
    const removed = await this.repository.removeMember(actor, memberUserId)
    try {
      await this.identityProvider.revokeAllSessions(removed.providerSubject)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'O acesso local foi revogado; a revogação no provedor está pendente.',
        503,
      )
    }
  }

  transferOwnership(actor: ActorContext, memberUserId: string) {
    requirePermission(actor.role, 'members.transfer_ownership')
    requireFreshAuthentication(actor)
    requireUuid(memberUserId, 'Membro inválido.')
    if (memberUserId === actor.userId) {
      throw new IdentityError('invalid_request', 'O usuário informado já é proprietário.', 409)
    }
    return this.repository.transferOwnership(actor, memberUserId)
  }
}

function requestedAssignableRole(actorRole: MembershipRole, value: unknown) {
  if (!isMembershipRole(value) || !assignableRoles(actorRole).includes(value)) {
    throw new IdentityError('invalid_request', 'Papel inválido para esta operação.', 400)
  }
  return value
}

function normalizeEmail(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw new IdentityError('invalid_request', 'E-mail inválido.', 400)
  }
  return normalized
}

function organizationName(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length < 2 || normalized.length > 100) {
    throw new IdentityError('invalid_request', 'Nome deve ter entre 2 e 100 caracteres.', 400)
  }
  return normalized
}

function organizationSlug(value: string | undefined, name: string) {
  const candidate = (value || name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(candidate)) {
    throw new IdentityError('invalid_request', 'Slug de organização inválido.', 400)
  }
  return candidate
}

function requireUuid(value: string, message: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new IdentityError('invalid_request', message, 400)
  }
}

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
