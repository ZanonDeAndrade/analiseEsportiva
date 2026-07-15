import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL e obrigatoria para executar migrations.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './backend/src/infrastructure/database/schema.ts',
  out: './backend/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
  migrations: {
    schema: 'ops',
    table: 'schema_migrations',
  },
})
