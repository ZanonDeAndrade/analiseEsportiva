import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRuntimeConfiguration } from './config.js'

const MANAGED_KEYS = [
  'NODE_ENV',
  'BETINTEL_ENVIRONMENT',
  'DATABASE_URL',
  'WORKER_DATABASE_URL',
  'SCHEDULER_DATABASE_URL',
  'BULLMQ_REDIS_URL',
  'REDIS_URL',
  'REDIS_KEY_PREFIX',
  'ENABLE_LEGACY_HTTP_ROUTES',
  'BETINTEL_BACKEND_HOST',
  'AUTH0_DOMAIN',
  'AUTH0_AUDIENCE',
  'AUTH0_MANAGEMENT_CLIENT_ID',
  'AUTH0_MANAGEMENT_CLIENT_SECRET',
  'AUTH0_SPA_CLIENT_ID',
  'CORS_ALLOWED_ORIGINS',
  'REQUEST_IP_HASH_KEY',
  'APP_RELEASE',
  'OTEL_SERVICE_NAME',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'SENTRY_DSN',
  'METRICS_BEARER_TOKEN',
] as const

test('migration valida somente o ambiente e o banco necessarios', () => {
  withEnvironment({
    NODE_ENV: 'production',
    BETINTEL_ENVIRONMENT: 'staging',
    DATABASE_URL: 'postgresql://migration@staging-db.internal/betintel',
    REDIS_KEY_PREFIX: 'betintel:staging',
  }, () => {
    assert.deepEqual(validateRuntimeConfiguration('migration'), {
      environment: 'staging',
      role: 'migration',
    })
  })
})

test('worker implantado exige banco dedicado e Redis remoto', () => {
  const base = {
    NODE_ENV: 'production',
    BETINTEL_ENVIRONMENT: 'production',
    DATABASE_URL: 'postgresql://api@production-db.internal/betintel',
    WORKER_DATABASE_URL: 'postgresql://worker@production-db.internal/betintel',
    BULLMQ_REDIS_URL: 'rediss://production-queue.internal:6379',
    REDIS_KEY_PREFIX: 'betintel:production',
    ...deployedTelemetry('worker'),
  }
  withEnvironment(base, () => {
    assert.equal(validateRuntimeConfiguration('worker').role, 'worker')
  })
  withEnvironment({ ...base, WORKER_DATABASE_URL: base.DATABASE_URL }, () => {
    assert.throws(
      () => validateRuntimeConfiguration('worker'),
      /papel PostgreSQL dedicado/,
    )
  })
})

test('API implantada recusa placeholders e origem sem TLS', () => {
  const environment = deployedApiEnvironment()
  withEnvironment(environment, () => {
    assert.equal(validateRuntimeConfiguration('api').environment, 'production')
  })
  withEnvironment({ ...environment, AUTH0_DOMAIN: 'seu-tenant.example.com' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /AUTH0_DOMAIN contem valor de exemplo/)
  })
  withEnvironment({ ...environment, CORS_ALLOWED_ORIGINS: 'http://app.betintel.test' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /somente HTTPS/)
  })
})

function deployedApiEnvironment() {
  return {
    NODE_ENV: 'production',
    BETINTEL_ENVIRONMENT: 'production',
    DATABASE_URL: 'postgresql://api@production-db.internal/betintel',
    REDIS_URL: 'rediss://production-cache.internal:6379',
    REDIS_KEY_PREFIX: 'betintel:production',
    ENABLE_LEGACY_HTTP_ROUTES: 'false',
    BETINTEL_BACKEND_HOST: '0.0.0.0',
    AUTH0_DOMAIN: 'tenant.us.auth0.com',
    AUTH0_AUDIENCE: 'https://api.betintel.test/v1',
    AUTH0_MANAGEMENT_CLIENT_ID: 'management-client-id',
    AUTH0_MANAGEMENT_CLIENT_SECRET: 'a-secure-management-secret',
    AUTH0_SPA_CLIENT_ID: 'spa-client-id',
    CORS_ALLOWED_ORIGINS: 'https://app.betintel.test',
    REQUEST_IP_HASH_KEY: '0123456789abcdef0123456789abcdef',
    METRICS_BEARER_TOKEN: '0123456789abcdef0123456789abcdef',
    ...deployedTelemetry('api'),
  }
}

function deployedTelemetry(role: 'api' | 'worker') {
  return {
    APP_RELEASE: 'sha256-release',
    OTEL_SERVICE_NAME: `betintel-${role}`,
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel-collector.internal',
    SENTRY_DSN: 'https://public-key@sentry.internal/1',
  }
}

function withEnvironment(
  values: Partial<Record<(typeof MANAGED_KEYS)[number], string>>,
  callback: () => void,
) {
  const previous = new Map<string, string | undefined>()
  for (const key of MANAGED_KEYS) {
    previous.set(key, process.env[key])
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value
  try {
    callback()
  } finally {
    for (const key of MANAGED_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
