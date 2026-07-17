import { setTimeout as delay } from 'node:timers/promises'
import { Redis } from 'ioredis'
import {
  CircuitOpenError,
  QuotaExceededError,
} from '../../application/jobs/errors.js'
import type {
  PostgresProviderQuota,
  ProviderQuotaLimits,
} from '../database/providerQuota.js'
import type { SafeJobLogger } from './logging.js'
import { telemetryMetrics } from '../../telemetry/metrics.js'
import { withSpan } from '../../telemetry/tracing.js'
import { SpanKind } from '@opentelemetry/api'

export class ExternalProviderError extends Error {
  readonly code: string
  constructor(readonly provider: string, status?: number) {
    super(status ? `${provider} retornou HTTP ${status}.` : `${provider} indisponivel.`)
    this.name = 'ExternalProviderError'
    this.code = status === 429 ? 'provider_rate_limited' : 'provider_unavailable'
  }
}

export class RedisCircuitBreaker {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly failureThreshold = 3,
    private readonly resetAfterMs = 60_000,
  ) {}

  async assertClosed(provider: string) {
    if (await this.redis.exists(this.key(provider, 'open'))) throw new CircuitOpenError(provider)
  }

  async recordSuccess(provider: string) {
    await this.redis.del(this.key(provider, 'failures'), this.key(provider, 'open'))
  }

  async recordFailure(provider: string) {
    const key = this.key(provider, 'failures')
    const failures = await this.redis.incr(key)
    if (failures === 1) await this.redis.pexpire(key, this.resetAfterMs)
    if (failures >= this.failureThreshold) {
      await this.redis.set(this.key(provider, 'open'), '1', 'PX', this.resetAfterMs)
    }
  }

  async waitForSlot(provider: string, minimumGapMs: number, signal?: AbortSignal) {
    if (minimumGapMs <= 0) return
    const waitMs = Number(await this.redis.eval(
      `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
       local now = tonumber(ARGV[1])
       local gap = tonumber(ARGV[2])
       local scheduled = math.max(current, now)
       redis.call('SET', KEYS[1], scheduled + gap, 'PX', math.max(gap * 4, 1000))
       return scheduled - now`,
      1,
      this.key(provider, 'next-request-at'),
      Date.now(),
      minimumGapMs,
    ))
    if (waitMs > 0) await delay(waitMs, undefined, { signal })
  }

  private key(provider: string, suffix: string) {
    return `${this.prefix}:provider:${provider}:${suffix}`
  }
}

export class ExternalRequestGuard {
  constructor(
    private readonly quota: PostgresProviderQuota,
    private readonly breaker: RedisCircuitBreaker,
    private readonly logger: SafeJobLogger,
  ) {}

  async execute<T extends { ok: boolean; status: number }>(input: {
    provider: string
    limits: ProviderQuotaLimits
    minimumGapMs: number
    signal?: AbortSignal
    operation: () => Promise<T>
    maxAttempts?: number
    baseRetryDelayMs?: number
  }): Promise<T> {
    await this.breaker.assertClosed(input.provider)
    const startedAt = performance.now()
    const maxAttempts = Math.max(1, Math.min(5, input.maxAttempts ?? 1))
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await this.breaker.assertClosed(input.provider)
        await this.breaker.waitForSlot(input.provider, input.minimumGapMs, input.signal)
        const reservation = await this.quota.reserve(input.provider, input.limits)
        for (const alert of reservation.alerts) {
          telemetryMetrics.recordQuota(input.provider, alert.period, alert.count, alert.limit)
          this.logger.info('provider_quota_alert', {
            provider: input.provider,
            period: alert.period,
            count: alert.count,
            limit: alert.limit,
          })
        }
        try {
          const response = await withSpan(
            `external ${input.provider}`,
            { 'peer.service': input.provider, 'betintel.provider': input.provider, 'betintel.retry_attempt': attempt },
            input.operation,
            { kind: SpanKind.CLIENT },
          )
          if (response.status === 429 || response.status >= 500) {
            throw new ExternalProviderError(input.provider, response.status)
          }
          await this.breaker.recordSuccess(input.provider)
          telemetryMetrics.recordExternal(input.provider, 'success')
          return response
        } catch (error) {
          if (!(error instanceof QuotaExceededError) && !(error instanceof CircuitOpenError)) {
            await this.breaker.recordFailure(input.provider)
          }
          if (attempt >= maxAttempts || !retryable(error)) throw error
          const backoff = (input.baseRetryDelayMs ?? 250) * (2 ** (attempt - 1))
          await delay(backoff + Math.floor(Math.random() * Math.max(1, backoff / 4)), undefined, { signal: input.signal })
        }
      }
      throw new ExternalProviderError(input.provider)
    } catch (error) {
      telemetryMetrics.recordExternal(input.provider, externalOutcome(error))
      throw error
    } finally {
      this.logger.info('external_api_completed', {
        provider: input.provider,
        durationMs: Math.round(performance.now() - startedAt),
      })
    }
  }
}

function retryable(error: unknown) {
  if (error instanceof QuotaExceededError || error instanceof CircuitOpenError) return false
  return error instanceof ExternalProviderError || error instanceof TypeError
}

function externalOutcome(error: unknown) {
  if (error instanceof QuotaExceededError) return 'quota_exceeded'
  if (error instanceof CircuitOpenError) return 'circuit_open'
  if (error instanceof ExternalProviderError) return error.code
  return 'failure'
}
