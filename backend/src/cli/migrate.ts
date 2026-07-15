import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { validateRuntimeConfiguration } from '../config.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'

validateRuntimeConfiguration('migration')

const connection = createDatabaseConnection()

try {
  await migrate(connection.db, {
    migrationsFolder: resolve('backend/migrations'),
    migrationsSchema: 'ops',
    migrationsTable: 'schema_migrations',
  })
  console.log('Migrations PostgreSQL aplicadas com sucesso.')
} finally {
  await connection.close()
}
