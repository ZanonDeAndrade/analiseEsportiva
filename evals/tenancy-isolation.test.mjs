import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('tenancy mantem papeis e permissoes centralizados', async () => {
  const authorization = await read('backend/src/application/authorization.ts')
  assert.match(authorization, /MembershipRoles/)
  assert.match(authorization, /rolePermissions/)
  for (const role of ['owner', 'admin', 'member', 'viewer']) {
    assert.match(authorization, new RegExp(`\\b${role.toUpperCase()}\\b`))
  }
})

test('migracao ativa e forca RLS nos recursos privados', async () => {
  const migration = await read('backend/migrations/0005_organization_tenancy_rls.sql')
  const forcedTables = migration.match(/FORCE ROW LEVEL SECURITY/g) ?? []
  assert.equal(forcedTables.length, 12)
  assert.match(migration, /current_setting\('app\.organization_id', true\)/)
  assert.match(migration, /current_setting\('app\.user_id', true\)/)
})

test('documentacao cobre isolamento, operacao e rollback', async () => {
  const documentation = await read('docs/organization-tenancy.md')
  assert.match(documentation, /Matriz central de permissões/i)
  assert.match(documentation, /cache/i)
  assert.match(documentation, /object storage/i)
  assert.match(documentation, /rollback/i)
  assert.match(documentation, /BYPASSRLS/)
})
