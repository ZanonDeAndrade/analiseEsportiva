import { metrics } from '@opentelemetry/api'
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client'
import type { DatabaseConnection } from '../infrastructure/database/client.js'

const meter = metrics.getMeter('betintel-application')

export class BetIntelMetrics {
  readonly registry = new Registry()
  private readonly httpRequests: Counter
  private readonly httpDuration: Histogram
  private readonly databaseDuration: Histogram
  private readonly databaseConnections: Gauge
  private readonly dependencyUp: Gauge
  private readonly cacheOperations: Counter
  private readonly queueDepth: Gauge
  private readonly jobExecutions: Counter
  private readonly jobDuration: Histogram
  private readonly externalRequests: Counter
  private readonly quotaRatio: Gauge
  private readonly predictions: Counter
  private readonly insufficientData: Counter
  private readonly modelOperationDuration: Histogram
  private readonly webhookEvents: Gauge
  private readonly billingDivergences: Gauge
  private readonly sportsDataAge: Gauge

  private readonly otelHttpRequests = meter.createCounter('betintel.http.requests')
  private readonly otelHttpDuration = meter.createHistogram('betintel.http.request.duration', { unit: 's' })
  private readonly otelJobExecutions = meter.createCounter('betintel.job.executions')
  private readonly otelJobDuration = meter.createHistogram('betintel.job.duration', { unit: 's' })
  private readonly otelExternalRequests = meter.createCounter('betintel.external_api.requests')
  private readonly otelModelDuration = meter.createHistogram('betintel.model.operation.duration', { unit: 's' })

  constructor(serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'betintel-api') {
    this.registry.setDefaultLabels({ service: serviceName })
    collectDefaultMetrics({ register: this.registry, prefix: 'betintel_' })
    const registers = [this.registry]

    this.httpRequests = new Counter({
      name: 'betintel_http_requests_total',
      help: 'Total HTTP requests by normalized route, method and status.',
      labelNames: ['route', 'method', 'status_code'],
      registers,
    })
    this.httpDuration = new Histogram({
      name: 'betintel_http_request_duration_seconds',
      help: 'HTTP request latency by normalized route and method.',
      labelNames: ['route', 'method', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers,
    })
    this.databaseDuration = new Histogram({
      name: 'betintel_database_operation_duration_seconds',
      help: 'Database probe and operational query latency.',
      labelNames: ['operation', 'outcome'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers,
    })
    this.databaseConnections = new Gauge({
      name: 'betintel_database_connections',
      help: 'PostgreSQL pool connections by state.',
      labelNames: ['state'],
      registers,
    })
    this.dependencyUp = new Gauge({
      name: 'betintel_dependency_up',
      help: 'Essential dependency availability, where 1 is up.',
      labelNames: ['dependency'],
      registers,
    })
    this.cacheOperations = new Counter({
      name: 'betintel_cache_operations_total',
      help: 'Cache operations by cache and result.',
      labelNames: ['cache', 'result'],
      registers,
    })
    this.queueDepth = new Gauge({
      name: 'betintel_queue_depth',
      help: 'Durable jobs by queue and status.',
      labelNames: ['queue', 'status'],
      registers,
    })
    this.jobExecutions = new Counter({
      name: 'betintel_job_executions_total',
      help: 'Worker job executions by queue, type and outcome.',
      labelNames: ['queue', 'type', 'outcome'],
      registers,
    })
    this.jobDuration = new Histogram({
      name: 'betintel_job_duration_seconds',
      help: 'Worker job duration by queue, type and outcome.',
      labelNames: ['queue', 'type', 'outcome'],
      buckets: [0.01, 0.1, 0.5, 1, 5, 15, 30, 60, 300, 900, 3600],
      registers,
    })
    this.externalRequests = new Counter({
      name: 'betintel_external_api_requests_total',
      help: 'External provider calls by provider and outcome.',
      labelNames: ['provider', 'outcome'],
      registers,
    })
    this.quotaRatio = new Gauge({
      name: 'betintel_external_api_quota_ratio',
      help: 'External provider quota utilization ratio.',
      labelNames: ['provider', 'period'],
      registers,
    })
    this.predictions = new Counter({
      name: 'betintel_predictions_total',
      help: 'Prediction responses by status.',
      labelNames: ['status'],
      registers,
    })
    this.insufficientData = new Counter({
      name: 'betintel_insufficient_data_total',
      help: 'Markets returned as dados_insuficientes.',
      labelNames: ['market'],
      registers,
    })
    this.modelOperationDuration = new Histogram({
      name: 'betintel_model_operation_duration_seconds',
      help: 'Training, evaluation and backtest duration.',
      labelNames: ['operation', 'outcome'],
      buckets: [0.1, 1, 5, 15, 30, 60, 300, 900, 3600],
      registers,
    })
    this.webhookEvents = new Gauge({
      name: 'betintel_webhook_events',
      help: 'Persisted billing webhook events by provider and status.',
      labelNames: ['provider', 'status'],
      registers,
    })
    this.billingDivergences = new Gauge({
      name: 'betintel_billing_reconciliation_divergences',
      help: 'Divergences found by the latest billing reconciliation.',
      registers,
    })
    this.sportsDataAge = new Gauge({
      name: 'betintel_sports_data_age_seconds',
      help: 'Age of the most recently updated sports fixture.',
      registers,
    })

    for (const result of ['hit', 'miss']) this.cacheOperations.labels('sports', result).inc(0)
  }

  recordHttp(input: { route: string; method: string; statusCode: number; durationMs: number }) {
    const labels = {
      route: normalizeRoute(input.route),
      method: input.method.toUpperCase(),
      status_code: String(input.statusCode),
    }
    const seconds = input.durationMs / 1_000
    this.httpRequests.inc(labels)
    this.httpDuration.observe(labels, seconds)
    this.otelHttpRequests.add(1, labels)
    this.otelHttpDuration.record(seconds, labels)
  }

  recordDatabase(operation: string, durationMs: number, up: boolean) {
    const outcome = up ? 'success' : 'failure'
    this.databaseDuration.observe({ operation, outcome }, durationMs / 1_000)
    this.dependencyUp.set({ dependency: 'postgresql' }, up ? 1 : 0)
  }

  recordDependency(dependency: 'postgresql' | 'redis' | 'auth0' | 'object_storage', up: boolean) {
    this.dependencyUp.set({ dependency }, up ? 1 : 0)
  }

  recordCache(cache: string, result: 'hit' | 'miss') {
    this.cacheOperations.inc({ cache: boundedLabel(cache), result })
  }

  recordJob(input: { queue: string; type: string; outcome: string; durationMs: number }) {
    const labels = {
      queue: boundedLabel(input.queue),
      type: boundedLabel(input.type),
      outcome: boundedLabel(input.outcome),
    }
    const seconds = input.durationMs / 1_000
    this.jobExecutions.inc(labels)
    this.jobDuration.observe(labels, seconds)
    this.otelJobExecutions.add(1, labels)
    this.otelJobDuration.record(seconds, labels)
    if (['model-training', 'model-evaluation', 'model-backtest'].includes(input.type)) {
      const modelLabels = { operation: input.type, outcome: labels.outcome }
      this.modelOperationDuration.observe(modelLabels, seconds)
      this.otelModelDuration.record(seconds, modelLabels)
    }
  }

  recordExternal(provider: string, outcome: string) {
    const labels = { provider: boundedLabel(provider), outcome: boundedLabel(outcome) }
    this.externalRequests.inc(labels)
    this.otelExternalRequests.add(1, labels)
  }

  recordQuota(provider: string, period: string, count: number, limit: number) {
    this.quotaRatio.set(
      { provider: boundedLabel(provider), period: boundedLabel(period) },
      limit > 0 ? Math.min(count / limit, 10) : 0,
    )
  }

  recordPrediction(ignoredMarkets: Array<{ market: string }>) {
    this.predictions.inc({ status: ignoredMarkets.length ? 'partial' : 'available' })
    for (const ignored of ignoredMarkets) {
      this.insufficientData.inc({ market: boundedLabel(ignored.market) })
    }
  }

  async collectOperational(connection: DatabaseConnection) {
    this.databaseConnections.set({ state: 'total' }, Number(connection.pool.totalCount ?? 0))
    this.databaseConnections.set({ state: 'idle' }, Number(connection.pool.idleCount ?? 0))
    this.databaseConnections.set({ state: 'waiting' }, Number(connection.pool.waitingCount ?? 0))
    const startedAt = performance.now()
    try {
      const [jobs, freshness, webhooks, quota, reconciliation] = await Promise.all([
        connection.pool.query<{ queue: string; status: string; count: string }>(
          `select queue, status::text, count(*)::text as count
             from ops.background_jobs group by queue, status`,
        ),
        connection.pool.query<{ age_seconds: string | null }>(
          `select extract(epoch from (now() - max(coalesce(source_updated_at, updated_at))))::text as age_seconds
             from sports.fixtures`,
        ),
        connection.pool.query<{ provider: string; status: string; count: string }>(
          `select provider, status::text, count(*)::text as count
             from billing.webhook_events group by provider, status`,
        ),
        connection.pool.query<{ provider: string; period_type: string; request_count: number; quota_limit: number }>(
          `select provider, period_type, request_count, quota_limit
             from ops.provider_api_usage
            where period_start in (current_date, date_trunc('month', current_date)::date)`,
        ),
        connection.pool.query<{ divergences: string | null }>(
          `select result_metadata ->> 'divergences' as divergences
             from ops.background_jobs
            where job_type = 'billing-reconciliation' and status = 'succeeded'
            order by completed_at desc nulls last limit 1`,
        ),
      ])
      this.queueDepth.reset()
      for (const row of jobs.rows) {
        this.queueDepth.set({ queue: boundedLabel(row.queue), status: boundedLabel(row.status) }, Number(row.count))
      }
      this.webhookEvents.reset()
      for (const row of webhooks.rows) {
        this.webhookEvents.set({ provider: boundedLabel(row.provider), status: boundedLabel(row.status) }, Number(row.count))
      }
      for (const row of quota.rows) {
        this.recordQuota(row.provider, row.period_type, row.request_count, row.quota_limit)
      }
      this.sportsDataAge.set(Math.max(0, Number(freshness.rows[0]?.age_seconds ?? 0)))
      this.billingDivergences.set(Math.max(0, Number(reconciliation.rows[0]?.divergences ?? 0)))
      this.recordDatabase('metrics_collect', performance.now() - startedAt, true)
    } catch {
      this.recordDatabase('metrics_collect', performance.now() - startedAt, false)
    }
  }

  async exposition() {
    return this.registry.metrics()
  }

  get contentType() {
    return this.registry.contentType
  }
}

export const telemetryMetrics = new BetIntelMetrics()

function normalizeRoute(route: string | undefined) {
  const value = route?.trim() || 'unmatched'
  return value.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').slice(0, 160)
}

function boundedLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').slice(0, 80) || 'unknown'
}
