import { ManagementClient } from 'auth0'
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose'
import { IdentityError } from '../../application/identityErrors.js'
import type {
  IdentityProvider,
  ProviderSession,
  ProviderUser,
  VerifiedIdentity,
} from '../../application/ports/identity.js'

export interface Auth0IdentityProviderConfig {
  domain: string
  audience: string
  managementClientId: string
  managementClientSecret: string
  spaClientId: string
  sessionIdClaim: string
  authenticationTimeClaim: string
  jwks?: JWTVerifyGetKey
}

export class Auth0IdentityProvider implements IdentityProvider {
  private readonly issuer: string
  private readonly jwks: JWTVerifyGetKey
  private readonly management: ManagementClient

  constructor(private readonly config: Auth0IdentityProviderConfig) {
    const domain = normalizeDomain(config.domain)
    this.issuer = `https://${domain}/`
    this.jwks =
      config.jwks ??
      createRemoteJWKSet(new URL(`${this.issuer}.well-known/jwks.json`), {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      })
    this.management = new ManagementClient({
      domain,
      clientId: config.managementClientId,
      clientSecret: config.managementClientSecret,
      timeoutInSeconds: 5,
      maxRetries: 1,
    })
  }

  async verifyAccessToken(token: string): Promise<VerifiedIdentity> {
    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.config.audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'iat', 'exp'],
        clockTolerance: 5,
      })
      return identityFromPayload(
        verified.payload,
        this.config.sessionIdClaim,
        this.config.authenticationTimeClaim,
      )
    } catch {
      throw new IdentityError('invalid_token', 'Token de acesso inválido.', 401)
    }
  }

  async getUser(subject: string): Promise<ProviderUser> {
    const response = await this.management.users.get(subject)
    return {
      subject: response.user_id ?? subject,
      email: response.email,
      emailVerified: response.email_verified === true,
      displayName: response.name ?? response.nickname,
      updatedAt: response.updated_at,
      blocked: response.blocked === true,
    }
  }

  async listSessions(subject: string): Promise<ProviderSession[]> {
    const page = await this.management.users.sessions.list(subject, { take: 100 })
    return page.data.flatMap((session) => {
      if (!session.id) return []
      return [
        {
          id: session.id,
          createdAt: dateString(session.created_at),
          authenticatedAt: dateString(session.authenticated_at),
          expiresAt: dateString(session.expires_at),
          lastSeenAt: dateString(session.last_interacted_at ?? session.updated_at),
          userAgent: session.device?.last_user_agent ?? session.device?.initial_user_agent,
        },
      ]
    })
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.management.sessions.revoke(sessionId)
  }

  async revokeAllSessions(subject: string): Promise<void> {
    await this.management.users.revokeAccess(subject)
  }

  async requestEmailChange(subject: string, newEmail: string): Promise<void> {
    await this.management.users.update(subject, {
      email: newEmail,
      email_verified: false,
      verify_email: true,
      client_id: this.config.spaClientId,
    })
  }

  async blockUser(subject: string): Promise<void> {
    await this.management.users.update(subject, { blocked: true })
  }

  async deleteUser(subject: string): Promise<void> {
    await this.management.users.delete(subject)
  }
}

function identityFromPayload(
  payload: JWTPayload,
  sessionIdClaim: string,
  authenticationTimeClaim: string,
): VerifiedIdentity {
  const sessionId = payload[sessionIdClaim]
  const authenticatedAt = payload[authenticationTimeClaim]

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number' ||
    typeof sessionId !== 'string' ||
    sessionId.length < 3
  ) {
    throw new Error('claims obrigatorias ausentes')
  }

  return {
    provider: 'auth0',
    subject: payload.sub,
    sessionId,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    authenticatedAt:
      typeof authenticatedAt === 'number'
        ? new Date(authenticatedAt * 1000).toISOString()
        : undefined,
  }
}

function normalizeDomain(value: string) {
  const domain = value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('AUTH0_DOMAIN inválido.')
  return domain
}

function dateString(value: string | Record<string, unknown> | null | undefined) {
  return typeof value === 'string' ? value : undefined
}
