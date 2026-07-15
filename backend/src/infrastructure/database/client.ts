import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { databasePoolMax, databaseUrl } from '../../config.js'
import * as schema from './schema.js'
import { captureOperationalError } from '../../telemetry/errors.js'
import { telemetryMetrics } from '../../telemetry/metrics.js'

export type BetIntelDatabase = NodePgDatabase<typeof schema>

export interface DatabaseConnection {
  db: BetIntelDatabase
  pool: Pool
  close(): Promise<void>
}

export function createDatabaseConnection(connectionString = databaseUrl()): DatabaseConnection {
  const pool = new Pool({
    connectionString,
    max: databasePoolMax(),
    application_name: 'betintel-ai',
  })
  pool.on('error', (error) => {
    const code = (error as NodeJS.ErrnoException).code ?? 'postgres_pool_error'
    console.error(JSON.stringify({ level: 'error', event: 'postgres_pool_error', code }))
    telemetryMetrics.recordDependency('postgresql', false)
    captureOperationalError(error, { component: 'database' })
  })
  const db = drizzle(pool, { schema })

  return {
    db,
    pool,
    close: () => pool.end(),
  }
}

export async function assertSafeRuntimeDatabaseRole(
  connection: DatabaseConnection,
  environment = process.env.NODE_ENV,
): Promise<void> {
  if (environment !== 'production') return

  const result = await connection.pool.query<{
    rolname: string
    rolsuper: boolean
    rolbypassrls: boolean
  }>(`
    SELECT rolname, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `)
  const role = result.rows[0]

  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      'O papel PostgreSQL da aplicacao deve existir e nao pode ser SUPERUSER nem BYPASSRLS em producao.',
    )
  }
}
