import { eq, sql } from 'drizzle-orm'
import type { SystemStateRepository } from '../../application/ports/persistence.js'
import type { BetIntelDatabase } from './client.js'
import { systemState } from './schema.js'

export class PostgresSystemStateRepository implements SystemStateRepository {
  constructor(private readonly db: BetIntelDatabase) {}

  async get<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    const rows = await this.db
      .select({ value: systemState.value })
      .from(systemState)
      .where(eq(systemState.key, key))
      .limit(1)

    return rows[0] ? (rows[0].value as T) : null
  }

  async set(key: string, value: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(systemState)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemState.key,
        set: { value, updatedAt: sql`now()` },
      })
  }
}
