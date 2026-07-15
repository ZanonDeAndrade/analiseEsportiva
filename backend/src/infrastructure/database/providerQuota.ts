import { and, eq, sql } from 'drizzle-orm'
import { QuotaExceededError } from '../../application/jobs/errors.js'
import type { BetIntelDatabase } from './client.js'
import { providerApiUsage } from './schema.js'

export interface ProviderQuotaLimits {
  daily: number
  monthly: number
  alertPercentage: number
}

export interface ProviderQuotaReservation {
  alerts: Array<{ period: 'daily' | 'monthly'; count: number; limit: number }>
}

export class PostgresProviderQuota {
  constructor(private readonly db: BetIntelDatabase) {}

  async reserve(
    provider: string,
    limits: ProviderQuotaLimits,
    now = new Date(),
  ): Promise<ProviderQuotaReservation> {
    return this.db.transaction(async (tx) => {
      const periods = [
        { type: 'daily' as const, start: dayStart(now), limit: limits.daily },
        { type: 'monthly' as const, start: monthStart(now), limit: limits.monthly },
      ]
      const alerts: ProviderQuotaReservation['alerts'] = []
      for (const period of periods) {
        const threshold = Math.max(1, Math.ceil(period.limit * limits.alertPercentage / 100))
        await tx
          .insert(providerApiUsage)
          .values({
            provider,
            periodType: period.type,
            periodStart: period.start,
            quotaLimit: period.limit,
            alertThreshold: threshold,
          })
          .onConflictDoUpdate({
            target: [
              providerApiUsage.provider,
              providerApiUsage.periodType,
              providerApiUsage.periodStart,
            ],
            set: { quotaLimit: period.limit, alertThreshold: threshold, updatedAt: sql`now()` },
          })
        const incremented = await tx
          .update(providerApiUsage)
          .set({
            requestCount: sql`${providerApiUsage.requestCount} + 1`,
            alertedAt: sql`case when ${providerApiUsage.alertedAt} is null and ${providerApiUsage.requestCount} + 1 >= ${threshold} then now() else ${providerApiUsage.alertedAt} end`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(providerApiUsage.provider, provider),
              eq(providerApiUsage.periodType, period.type),
              eq(providerApiUsage.periodStart, period.start),
              sql`${providerApiUsage.requestCount} < ${period.limit}`,
            ),
          )
          .returning({ count: providerApiUsage.requestCount })
        if (!incremented[0]) throw new QuotaExceededError(provider)
        if (incremented[0].count === threshold) {
          alerts.push({ period: period.type, count: incremented[0].count, limit: period.limit })
        }
      }
      return { alerts }
    })
  }
}

function dayStart(date: Date) {
  return date.toISOString().slice(0, 10)
}

function monthStart(date: Date) {
  return `${date.toISOString().slice(0, 7)}-01`
}
