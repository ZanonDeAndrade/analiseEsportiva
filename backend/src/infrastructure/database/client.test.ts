import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'pg'
import {
  assertSafeRuntimeDatabaseRole,
  createDatabaseConnection,
  type DatabaseConnection,
} from './client.js'

function connectionWithRole(
  role: { rolname: string; rolsuper: boolean; rolbypassrls: boolean } | undefined,
) {
  const pool = {
    query: async () => ({ rows: role ? [role] : [] }),
  } as unknown as Pool
  return { pool } as DatabaseConnection
}

test('boot de producao aceita apenas role PostgreSQL sujeita a RLS', async () => {
  await assert.doesNotReject(() =>
    assertSafeRuntimeDatabaseRole(
      connectionWithRole({ rolname: 'betintel_app', rolsuper: false, rolbypassrls: false }),
      'production',
    ),
  )

  for (const role of [
    { rolname: 'postgres', rolsuper: true, rolbypassrls: false },
    { rolname: 'unsafe_app', rolsuper: false, rolbypassrls: true },
    undefined,
  ]) {
    await assert.rejects(
      () => assertSafeRuntimeDatabaseRole(connectionWithRole(role), 'production'),
      /SUPERUSER.*BYPASSRLS/,
    )
  }
})

test('pool trata erro de conexao ociosa sem derrubar o processo', async () => {
  const connection = createDatabaseConnection('postgresql://unused:unused@127.0.0.1:1/unused')
  assert.ok(connection.pool.listenerCount('error') > 0)
  await connection.close()
})
