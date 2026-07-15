import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose'
import { IdentityError } from '../../application/identityErrors.js'
import { Auth0IdentityProvider } from './auth0IdentityProvider.js'

const issuer = 'https://tenant.test.auth0.com/'
const audience = 'https://api.betintel.test'
const sessionClaim = 'https://betintel.ai/session_id'
const authTimeClaim = 'https://betintel.ai/auth_time'

test('valida access token RS256 com issuer, audience, exp e claims de sessão', async () => {
  const keys = await keySet('valid')
  const provider = createProvider(keys.jwks)
  const token = await accessToken(keys)
  const identity = await provider.verifyAccessToken(token)

  assert.equal(identity.subject, 'auth0|user-1')
  assert.equal(identity.sessionId, 'session-1')
  assert.equal(identity.provider, 'auth0')
})

test('rejeita token expirado', async () => {
  const keys = await keySet('expired')
  const provider = createProvider(keys.jwks)
  const token = await accessToken(keys, { expirationTime: Math.floor(Date.now() / 1000) - 30 })
  await assertInvalid(provider.verifyAccessToken(token))
})

test('rejeita issuer incorreto', async () => {
  const keys = await keySet('issuer')
  const provider = createProvider(keys.jwks)
  const token = await accessToken(keys, { issuer: 'https://attacker.invalid/' })
  await assertInvalid(provider.verifyAccessToken(token))
})

test('rejeita audience incorreta e ID token usado como access token', async () => {
  const keys = await keySet('audience')
  const provider = createProvider(keys.jwks)
  const wrongAudience = await accessToken(keys, { audience: 'another-api' })
  const idToken = await accessToken(keys, { audience: 'spa-client-id' })

  await assertInvalid(provider.verifyAccessToken(wrongAudience))
  await assertInvalid(provider.verifyAccessToken(idToken))
})

test('rejeita token assinado por chave desconhecida', async () => {
  const trusted = await keySet('trusted')
  const attacker = await keySet('attacker')
  const provider = createProvider(trusted.jwks)
  await assertInvalid(provider.verifyAccessToken(await accessToken(attacker)))
})

test('falha de JWKS/Auth0 nunca libera acesso', async () => {
  const keys = await keySet('failure')
  const failingJwks: JWTVerifyGetKey = async () => {
    throw new Error('provider unavailable')
  }
  const provider = createProvider(failingJwks)
  await assertInvalid(provider.verifyAccessToken(await accessToken(keys)))
})

function createProvider(jwks: JWTVerifyGetKey) {
  return new Auth0IdentityProvider({
    domain: 'tenant.test.auth0.com',
    audience,
    managementClientId: 'test-management-client',
    managementClientSecret: 'not-a-real-secret',
    spaClientId: 'test-spa-client',
    sessionIdClaim: sessionClaim,
    authenticationTimeClaim: authTimeClaim,
    jwks,
  })
}

async function keySet(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = (await exportJWK(publicKey)) as JWK
  publicJwk.kid = kid
  publicJwk.use = 'sig'
  publicJwk.alg = 'RS256'
  return {
    privateKey,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    kid,
  }
}

async function accessToken(
  keys: Awaited<ReturnType<typeof keySet>>,
  override: {
    issuer?: string
    audience?: string
    expirationTime?: string | number
    kid?: string
  } = {},
) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    [sessionClaim]: 'session-1',
    [authTimeClaim]: now,
  })
    .setProtectedHeader({ alg: 'RS256', kid: override.kid ?? keys.kid })
    .setSubject('auth0|user-1')
    .setIssuer(override.issuer ?? issuer)
    .setAudience(override.audience ?? audience)
    .setIssuedAt(now)
    .setExpirationTime(override.expirationTime ?? '5 minutes')
    .sign(keys.privateKey)
}

async function assertInvalid(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof IdentityError)
    assert.equal(error.code, 'invalid_token')
    assert.equal(error.status, 401)
    return true
  })
}
