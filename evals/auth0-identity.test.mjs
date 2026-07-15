import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')

test('frontend usa SDK Auth0 sem persistencia manual de token', async () => {
  const [main, api] = await Promise.all([
    readFile(path.join(root, 'frontend/src/main.tsx'), 'utf8'),
    readFile(path.join(root, 'frontend/src/lib/api.ts'), 'utf8'),
  ])
  assert.match(main, /Auth0Provider/)
  assert.match(main, /useRefreshTokens/)
  assert.match(main, /cacheLocation="memory"/)
  assert.doesNotMatch(`${main}\n${api}`, /localStorage|clientSecret|password/)
})

test('backend exige access token e nao confia em tenant do cliente', async () => {
  const [provider, repository, http] = await Promise.all([
    readFile(path.join(root, 'backend/src/infrastructure/identity/auth0IdentityProvider.ts'), 'utf8'),
    readFile(path.join(root, 'backend/src/infrastructure/database/identityRepository.ts'), 'utf8'),
    readFile(path.join(root, 'backend/src/httpApp.ts'), 'utf8'),
  ])
  assert.match(provider, /algorithms: \['RS256'\]/)
  assert.match(provider, /issuer: this\.issuer/)
  assert.match(provider, /audience: this\.config\.audience/)
  assert.match(repository, /providerSubject/)
  assert.doesNotMatch(http, /headers\[['"]x-tenant-id/)
})

test('documentacao mantem gates Auth0 e rollback explicitos', async () => {
  const document = await readFile(path.join(root, 'docs/auth0-identity.md'), 'utf8')
  assert.match(document, /API de gerenciamento de sessões.*Enterprise/s)
  assert.match(document, /aceite de produção do PROMPT 3 permanece aberto/)
  assert.match(document, /## Rollback/)
  assert.match(document, /recovery code.*uso único/s)
})
