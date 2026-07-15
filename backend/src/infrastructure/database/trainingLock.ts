import type { Pool } from 'pg'

export class TrainingAlreadyRunningError extends Error {
  readonly code = 'training_already_running'
  constructor(readonly datasetVersionId: string) {
    super('Ja existe treino ativo para este dataset.')
    this.name = 'TrainingAlreadyRunningError'
  }
}

export class PostgresTrainingLock {
  constructor(private readonly pool: Pool) {}

  async runExclusive<T>(datasetVersionId: string, operation: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    let acquired = false
    try {
      const result = await client.query<{ locked: boolean }>(
        `select pg_try_advisory_lock(hashtextextended($1, 0)) as locked`,
        [`betintel:training:${datasetVersionId}`],
      )
      acquired = result.rows[0]?.locked === true
      if (!acquired) throw new TrainingAlreadyRunningError(datasetVersionId)
      return await operation()
    } finally {
      if (acquired) {
        await client.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [
          `betintel:training:${datasetVersionId}`,
        ])
      }
      client.release()
    }
  }
}
