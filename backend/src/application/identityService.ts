import type {
  ActorContext,
  IdentityProvider,
  IdentityRepository,
  IdentityRequestMetadata,
  ProviderSession,
} from './ports/identity.js'
import { IdentityError } from './identityErrors.js'

export class IdentityService {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly repository: IdentityRepository,
  ) {}

  async authenticate(
    authorizationHeader: string | undefined,
    metadata: IdentityRequestMetadata,
  ): Promise<ActorContext> {
    const token = bearerToken(authorizationHeader)
    const identity = await this.provider.verifyAccessToken(token)

    try {
      return await this.repository.resolveActor(identity, metadata)
    } catch (error) {
      if (
        !(error instanceof IdentityError) ||
        !['identity_not_provisioned', 'email_verification_required'].includes(error.code)
      ) {
        throw error
      }
    }

    let profile
    try {
      profile = await this.provider.getUser(identity.subject)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'Não foi possível confirmar a identidade no provedor.',
        503,
      )
    }

    if (profile.blocked) {
      throw new IdentityError('user_disabled', 'Acesso indisponível.', 403)
    }
    if (!profile.emailVerified) {
      throw new IdentityError(
        'email_verification_required',
        'Confirme o e-mail no Auth0 antes de acessar.',
        403,
      )
    }

    return this.repository.resolveActor(identity, metadata, profile)
  }

  async listSessions(actor: ActorContext) {
    const [local, provider] = await Promise.all([
      this.repository.listSessions(actor),
      this.listProviderSessions(actor),
    ])
    const localByProviderId = new Map(local.map((session) => [session.providerSessionId, session]))

    return provider.map((session) => ({
      ...session,
      current: session.id === actor.sessionId,
      revokedAt: localByProviderId.get(session.id)?.revokedAt,
    }))
  }

  async revokeSession(actor: ActorContext, sessionId: string) {
    const revoked = await this.repository.revokeSession(actor, sessionId, 'user_requested')
    if (!revoked) throw new IdentityError('not_found', 'Sessão não encontrada.', 404)

    try {
      await this.provider.revokeSession(sessionId)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'A sessão foi bloqueada localmente, mas a revogação no provedor está pendente.',
        503,
      )
    }
  }

  async requestEmailChange(actor: ActorContext, newEmail: string) {
    requireFreshAuthentication(actor)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) {
      throw new IdentityError('invalid_request', 'E-mail inválido.', 400)
    }

    await this.repository.markEmailChangePending(actor)
    await this.repository.revokeAllSessions(actor, 'email_change_requested')
    try {
      await this.provider.requestEmailChange(actor.subject, newEmail.trim().toLowerCase())
      await this.provider.revokeAllSessions(actor.subject)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'O acesso foi bloqueado localmente; a alteração no provedor está pendente.',
        503,
      )
    }
  }

  async deactivateAccount(actor: ActorContext, replacementOwnerUserId?: string) {
    requireFreshAuthentication(actor)
    await this.repository.deactivateAccount(actor, replacementOwnerUserId)
    try {
      await Promise.all([
        this.provider.revokeAllSessions(actor.subject),
        this.provider.blockUser(actor.subject),
      ])
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'A conta foi bloqueada localmente; a atualização no provedor está pendente.',
        503,
      )
    }
  }

  async deleteAccount(actor: ActorContext, replacementOwnerUserId?: string) {
    requireFreshAuthentication(actor)
    await this.repository.prepareAccountDeletion(actor, replacementOwnerUserId)
    try {
      await this.provider.deleteUser(actor.subject)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'A conta foi removida localmente; a exclusão no provedor está pendente.',
        503,
      )
    }
  }

  async syncProfile(actor: ActorContext) {
    let profile
    try {
      profile = await this.provider.getUser(actor.subject)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'Não foi possível confirmar a identidade no provedor.',
        503,
      )
    }
    if (profile.blocked) {
      await this.repository.blockUser(actor, 'provider_blocked')
      throw new IdentityError('user_disabled', 'Acesso indisponível.', 403)
    }
    await this.repository.syncProfile(actor, profile)
  }

  private async listProviderSessions(actor: ActorContext): Promise<ProviderSession[]> {
    try {
      return await this.provider.listSessions(actor.subject)
    } catch {
      throw new IdentityError(
        'identity_provider_unavailable',
        'Não foi possível consultar as sessões no provedor.',
        503,
      )
    }
  }
}

function bearerToken(header: string | undefined) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(header ?? '')
  if (!match) {
    throw new IdentityError('authentication_required', 'Autenticação necessária.', 401)
  }
  return match[1]
}

export function requireFreshAuthentication(actor: ActorContext, maximumAgeSeconds = 300) {
  const authenticatedAt = actor.authenticatedAt ? Date.parse(actor.authenticatedAt) : Number.NaN
  if (!Number.isFinite(authenticatedAt) || Date.now() - authenticatedAt > maximumAgeSeconds * 1000) {
    throw new IdentityError(
      'reauthentication_required',
      'Autenticação recente é necessária para esta operação.',
      403,
    )
  }
}
