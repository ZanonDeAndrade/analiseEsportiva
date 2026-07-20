export type RuntimeRole = 'api' | 'worker' | 'scheduler' | 'migration'
export type DeploymentEnvironment = 'development' | 'test' | 'staging' | 'production'

const DEPLOYMENT_ENVIRONMENTS = new Set<DeploymentEnvironment>([
  'development',
  'test',
  'staging',
  'production',
])

export interface ValidatedRuntimeConfiguration {
  environment: DeploymentEnvironment
  role: RuntimeRole
}

export interface StripeBillingConfiguration {
  secretKey: string
  webhookSecret: string
  appUrl: string
  portalConfigurationId?: string
  approvalReference: string
  automaticTax: boolean
  checkoutEnabled: boolean
  priceIds: Record<'brasileirao' | 'todas-ligas' | 'brasileirao-anual' | 'todas-ligas-anual', string>
}

export type SportsProviderName = 'api-football' | 'football-data' | 'football-data-org'

export interface ProviderUseConfiguration {
  provider: SportsProviderName
  policyReference: string
  licenseReference: string
  allowedEnvironments: DeploymentEnvironment[]
}

/**
 * Validates every setting needed by a process before it opens sockets or
 * connections. Secret values are never included in validation errors.
 */
export function validateRuntimeConfiguration(
  role: RuntimeRole,
): ValidatedRuntimeConfiguration {
  const environment = deploymentEnvironment()

  databaseUrl()
  databasePoolMax()
  if (role !== 'migration') telemetryConfig(role)

  if (role === 'api') {
    backendHost()
    backendPort()
    auth0ServerConfig()
    corsAllowedOrigins()
    requestIpHashKey()
    httpBodyLimit()
    httpRequestTimeoutMs()
    httpRateLimitMax()
    httpRateLimitWindow()
    redisUrl()
    metricsBearerToken()
    platformAdminSubjects()
    piiFieldEncryptionConfig()
    stripeBillingConfig()
  }

  if (role === 'worker') {
    workerDatabaseUrl()
    bullmqRedisUrl()
    workerPollIntervalMs()
    providerQuotaConfig('api-football')
    providerQuotaConfig('football-data')
    providerQuotaConfig('football-data-org')
    piiFieldEncryptionConfig()
    if (process.env.API_FOOTBALL_KEY?.trim()) providerUseConfiguration('api-football')
    if (process.env.BETINTEL_ENABLE_FOOTBALL_DATA === 'true') {
      providerUseConfiguration('football-data')
    }
    if (process.env.FOOTBALL_DATA_ORG_API_KEY?.trim()) {
      providerUseConfiguration('football-data-org')
    }
  }

  if (role === 'scheduler') {
    schedulerDatabaseUrl()
    schedulerIntervalMs()
    piiFieldEncryptionConfig()
  }

  if (environment === 'staging' || environment === 'production') {
    validateDeployedEnvironment(role, environment)
  }

  return { environment, role }
}

/**
 * Billing remains opt-in. Setting only a Stripe key never enables checkout:
 * the deploy must also carry an auditable approval reference and the complete
 * server-side Price mapping for that environment.
 */
export function stripeBillingConfig(): StripeBillingConfiguration | undefined {
  if (!booleanEnvironment('STRIPE_BILLING_ENABLED', false)) return undefined

  const secretKey = requiredEnvironment('STRIPE_SECRET_KEY')
  const webhookSecret = requiredEnvironment('STRIPE_WEBHOOK_SECRET')
  const appUrl = requiredEnvironment('BILLING_APP_URL').replace(/\/$/, '')
  const approvalReference = requiredEnvironment('BILLING_APPROVAL_REFERENCE')
  const environment = deploymentEnvironment()

  if (!/^sk_(test|live)_[A-Za-z0-9_]+$/.test(secretKey)) {
    throw new Error('STRIPE_SECRET_KEY possui formato invalido.')
  }
  if (!/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)) {
    throw new Error('STRIPE_WEBHOOK_SECRET possui formato invalido.')
  }
  if (environment === 'production' && !secretKey.startsWith('sk_live_')) {
    throw new Error('STRIPE_SECRET_KEY deve usar modo live em production.')
  }
  if (environment !== 'production' && secretKey.startsWith('sk_live_')) {
    throw new Error('STRIPE_SECRET_KEY live nao pode ser usada fora de production.')
  }
  validateUrl('BILLING_APP_URL', appUrl, isDeployedEnvironment() ? ['https:'] : ['http:', 'https:'])
  if (isDeployedEnvironment() && ['localhost', '127.0.0.1', '::1'].includes(new URL(appUrl).hostname)) {
    throw new Error('BILLING_APP_URL nao pode apontar para loopback em ambiente implantado.')
  }
  if (approvalReference.length < 6 || approvalReference.length > 200 || /[\r\n]/.test(approvalReference)) {
    throw new Error('BILLING_APPROVAL_REFERENCE possui formato invalido.')
  }

  const priceIds = {
    brasileirao: stripePriceId('STRIPE_PRICE_BRASILEIRAO_MONTHLY'),
    'todas-ligas': stripePriceId('STRIPE_PRICE_TODAS_LIGAS_MONTHLY'),
    'brasileirao-anual': stripePriceId('STRIPE_PRICE_BRASILEIRAO_YEARLY'),
    'todas-ligas-anual': stripePriceId('STRIPE_PRICE_TODAS_LIGAS_YEARLY'),
  }
  const portalConfigurationId = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim()
  if (portalConfigurationId && !/^bpc_[A-Za-z0-9_]+$/.test(portalConfigurationId)) {
    throw new Error('STRIPE_BILLING_PORTAL_CONFIGURATION_ID possui formato invalido.')
  }
  return {
    secretKey,
    webhookSecret,
    appUrl,
    portalConfigurationId,
    approvalReference,
    automaticTax: booleanEnvironment('STRIPE_AUTOMATIC_TAX_ENABLED', false),
    checkoutEnabled: booleanEnvironment('STRIPE_CHECKOUT_ENABLED', true),
    priceIds,
  }
}

function stripePriceId(name: string) {
  const value = requiredEnvironment(name)
  if (!/^price_[A-Za-z0-9_]+$/.test(value)) throw new Error(`${name} possui formato invalido.`)
  return value
}

export function deploymentEnvironment(): DeploymentEnvironment {
  const raw = (process.env.BETINTEL_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase()
  if (!DEPLOYMENT_ENVIRONMENTS.has(raw as DeploymentEnvironment)) {
    throw new Error('BETINTEL_ENVIRONMENT deve ser development, test, staging ou production.')
  }
  return raw as DeploymentEnvironment
}

export function backendHost() {
  return process.env.BETINTEL_BACKEND_HOST?.trim()
    || (isDeployedEnvironment() ? '0.0.0.0' : '127.0.0.1')
}

export function backendPort() {
  const raw = process.env.PORT?.trim() || process.env.BETINTEL_BACKEND_PORT?.trim()
  return positiveInteger('PORT/BETINTEL_BACKEND_PORT', raw, 3333, 65_535)
}

export function databaseUrl() {
  const value = requiredEnvironment('DATABASE_URL')
  validateUrl('DATABASE_URL', value, ['postgres:', 'postgresql:'])
  return value
}

export function databasePoolMax() {
  return positiveIntegerEnvironment('DATABASE_POOL_MAX', 10, 100)
}

export function workerDatabaseUrl() {
  const value = process.env.WORKER_DATABASE_URL?.trim()
  if (!value && isDeployedEnvironment()) {
    throw new Error('WORKER_DATABASE_URL e obrigatoria fora do ambiente local.')
  }
  const resolved = value || databaseUrl()
  validateUrl('WORKER_DATABASE_URL', resolved, ['postgres:', 'postgresql:'])
  return resolved
}

export function schedulerDatabaseUrl() {
  const value = process.env.SCHEDULER_DATABASE_URL?.trim()
  if (!value && isDeployedEnvironment()) {
    throw new Error('SCHEDULER_DATABASE_URL e obrigatoria fora do ambiente local.')
  }
  const resolved = value || workerDatabaseUrl()
  validateUrl('SCHEDULER_DATABASE_URL', resolved, ['postgres:', 'postgresql:'])
  return resolved
}

export interface Auth0ServerConfig {
  domain: string
  audience: string
  managementClientId: string
  managementClientSecret: string
  spaClientId: string
  sessionIdClaim: string
  authenticationTimeClaim: string
}

export function auth0ServerConfig(): Auth0ServerConfig {
  const domain = requiredEnvironment('AUTH0_DOMAIN')
  if (domain.includes('://') || !domain.includes('.')) {
    throw new Error('AUTH0_DOMAIN deve conter somente o hostname do tenant.')
  }
  const audience = requiredEnvironment('AUTH0_AUDIENCE')
  validateUrl('AUTH0_AUDIENCE', audience, ['https:'])
  return {
    domain,
    audience,
    managementClientId: requiredEnvironment('AUTH0_MANAGEMENT_CLIENT_ID'),
    managementClientSecret: requiredEnvironment('AUTH0_MANAGEMENT_CLIENT_SECRET'),
    spaClientId: requiredEnvironment('AUTH0_SPA_CLIENT_ID'),
    sessionIdClaim:
      process.env.AUTH0_SESSION_ID_CLAIM?.trim() || 'https://betintel.ai/session_id',
    authenticationTimeClaim:
      process.env.AUTH0_AUTH_TIME_CLAIM?.trim() || 'https://betintel.ai/auth_time',
  }
}

export function corsAllowedOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

  if ((!configured || configured.length === 0) && isDeployedEnvironment()) {
    throw new Error('CORS_ALLOWED_ORIGINS e obrigatoria fora do ambiente local.')
  }

  const origins = configured?.length
    ? configured
    : ['http://127.0.0.1:5173', 'http://localhost:5173']
  if (origins.includes('*')) throw new Error('CORS_ALLOWED_ORIGINS nao aceita wildcard.')
  for (const origin of origins) validateUrl('CORS_ALLOWED_ORIGINS', origin, ['http:', 'https:'])
  return origins
}

export function requestIpHashKey() {
  return requiredEnvironment('REQUEST_IP_HASH_KEY')
}

export function legacyHttpRoutesEnabled() {
  return booleanEnvironment('ENABLE_LEGACY_HTTP_ROUTES', false)
}

export function httpBodyLimit() {
  return positiveIntegerEnvironment('HTTP_BODY_LIMIT_BYTES', 1_000_000, 10_000_000)
}

export function httpRequestTimeoutMs() {
  return positiveIntegerEnvironment('HTTP_REQUEST_TIMEOUT_MS', 15_000, 120_000)
}

export function httpRateLimitMax() {
  return positiveIntegerEnvironment('HTTP_RATE_LIMIT_MAX', 120, 100_000)
}

export function httpRateLimitWindow() {
  const value = process.env.HTTP_RATE_LIMIT_WINDOW?.trim() || '1 minute'
  if (value.length > 64) throw new Error('HTTP_RATE_LIMIT_WINDOW excede o tamanho permitido.')
  return value
}

export function httpTrustProxyHops() {
  return positiveIntegerEnvironment('HTTP_TRUST_PROXY_HOPS', 1, 10)
}

export function shutdownGracePeriodMs() {
  return positiveIntegerEnvironment('SHUTDOWN_GRACE_PERIOD_MS', 25_000, 300_000)
}

export function readinessTimeoutMs() {
  return positiveIntegerEnvironment('READINESS_TIMEOUT_MS', 1_500, 10_000)
}

export interface TelemetryConfig {
  serviceName: string
  release: string
  otlpEndpoint?: string
  sentryDsn?: string
}

export function telemetryConfig(role: RuntimeRole): TelemetryConfig {
  const deployed = isDeployedEnvironment()
  const release = process.env.APP_RELEASE?.trim() || 'development'
  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || `betintel-${role}`
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
  const sentryDsn = process.env.SENTRY_DSN?.trim()
  if (deployed) {
    if (!process.env.APP_RELEASE?.trim()) throw new Error('APP_RELEASE e obrigatoria no deploy.')
    if (!otlpEndpoint) throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT e obrigatoria no deploy.')
    if (!sentryDsn) throw new Error('SENTRY_DSN e obrigatoria no deploy.')
  }
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/i.test(serviceName)) {
    throw new Error('OTEL_SERVICE_NAME possui formato invalido.')
  }
  if (release.length > 160 || /[\r\n]/.test(release)) throw new Error('APP_RELEASE possui formato invalido.')
  if (otlpEndpoint) validateUrl('OTEL_EXPORTER_OTLP_ENDPOINT', otlpEndpoint, deployed ? ['https:'] : ['http:', 'https:'])
  if (sentryDsn) validateUrl('SENTRY_DSN', sentryDsn, ['https:'])
  return { serviceName, release, otlpEndpoint, sentryDsn }
}

export function metricsBearerToken() {
  const value = process.env.METRICS_BEARER_TOKEN?.trim()
  if (!value && isDeployedEnvironment()) {
    throw new Error('METRICS_BEARER_TOKEN e obrigatoria no deploy.')
  }
  if (value && value.length < 32) {
    throw new Error('METRICS_BEARER_TOKEN deve ter pelo menos 32 caracteres.')
  }
  return value
}

export function platformAdminSubjects() {
  const values = process.env.PLATFORM_ADMIN_SUBJECTS?.split(',').map((value) => value.trim()).filter(Boolean) ?? []
  if (values.length === 0 && isDeployedEnvironment()) {
    throw new Error('PLATFORM_ADMIN_SUBJECTS e obrigatoria no deploy da API.')
  }
  if (values.some((value) => value.length > 255 || /[\r\n]/.test(value))) {
    throw new Error('PLATFORM_ADMIN_SUBJECTS contem identificador invalido.')
  }
  return values
}

export function piiFieldEncryptionConfig() {
  const configured = process.env.PII_FIELD_ENCRYPTION_KEY?.trim()
  if (!configured && isDeployedEnvironment()) {
    throw new Error('PII_FIELD_ENCRYPTION_KEY e obrigatoria fora do ambiente local.')
  }
  const keyBase64 = configured || Buffer.alloc(32, 17).toString('base64')
  if (Buffer.from(keyBase64, 'base64').length !== 32) {
    throw new Error('PII_FIELD_ENCRYPTION_KEY deve conter 32 bytes em base64.')
  }
  const keyVersion = process.env.PII_FIELD_ENCRYPTION_KEY_VERSION?.trim() || 'local-development-only'
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(keyVersion)) throw new Error('PII_FIELD_ENCRYPTION_KEY_VERSION invalida.')
  return { keyBase64, keyVersion }
}

export function redisUrl() {
  const value = process.env.REDIS_URL?.trim()
  if (!value && isDeployedEnvironment()) {
    throw new Error('REDIS_URL e obrigatoria fora do ambiente local.')
  }
  if (value) validateUrl('REDIS_URL', value, ['redis:', 'rediss:'])
  return value
}

export function bullmqRedisUrl() {
  const value = process.env.BULLMQ_REDIS_URL?.trim() || redisUrl()
  if (!value) throw new Error('BULLMQ_REDIS_URL ou REDIS_URL e obrigatoria para workers.')
  validateUrl('BULLMQ_REDIS_URL', value, ['redis:', 'rediss:'])
  return value
}

export function redisKeyPrefix() {
  return process.env.REDIS_KEY_PREFIX?.trim() || `betintel:${deploymentEnvironment()}`
}

export function workerPollIntervalMs() {
  return positiveIntegerEnvironment('JOB_DISPATCH_INTERVAL_MS', 1_000, 60_000)
}

export function workerQueues() {
  return process.env.WORKER_QUEUES?.split(',').map((value) => value.trim()).filter(Boolean)
}

export function schedulerIntervalMs() {
  return positiveIntegerEnvironment('INGESTION_SCHEDULER_INTERVAL_MS', 60 * 60_000, 31 * 24 * 60 * 60_000)
}

export function providerQuotaConfig(provider: SportsProviderName) {
  const prefix = providerEnvironmentPrefix(provider)
  const daily = positiveIntegerEnvironment(`${prefix}_DAILY_QUOTA`, provider === 'api-football' ? 100 : 1_000)
  const monthly = positiveIntegerEnvironment(`${prefix}_MONTHLY_QUOTA`, provider === 'api-football' ? 3_000 : 30_000)
  const alertPercentage = positiveIntegerEnvironment('PROVIDER_QUOTA_ALERT_PERCENT', 80, 100)
  return { daily, monthly, alertPercentage }
}

/**
 * Configuracao operacional declarada pelo responsavel pelo deploy. Os valores
 * sao referencias opacas e nao representam validacao ou parecer juridico.
 */
export function providerUseConfiguration(provider: SportsProviderName): ProviderUseConfiguration {
  const prefix = providerEnvironmentPrefix(provider)
  const policyReference = requiredEnvironment(`${prefix}_USE_POLICY_REFERENCE`)
  const licenseReference = requiredEnvironment(`${prefix}_LICENSE_REFERENCE`)
  const allowedEnvironments = requiredEnvironment(`${prefix}_ALLOWED_ENVIRONMENTS`)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is DeploymentEnvironment =>
      DEPLOYMENT_ENVIRONMENTS.has(value as DeploymentEnvironment),
    )
  const environment = deploymentEnvironment()
  if (allowedEnvironments.length === 0) {
    throw new Error(`${prefix}_ALLOWED_ENVIRONMENTS nao contem ambiente valido.`)
  }
  if (!allowedEnvironments.includes(environment)) {
    throw new Error(`Uso de ${provider} nao foi habilitado para ${environment}.`)
  }
  return { provider, policyReference, licenseReference, allowedEnvironments }
}

function providerEnvironmentPrefix(provider: SportsProviderName) {
  if (provider === 'api-football') return 'API_FOOTBALL'
  if (provider === 'football-data-org') return 'FOOTBALL_DATA_ORG'
  return 'FOOTBALL_DATA'
}

export function fixtureFreshnessMs(status?: string) {
  const live = new Set(['live', 'halftime', 'extra_time', 'penalties'])
  if (live.has(status ?? '')) {
    return positiveIntegerEnvironment('SPORTS_LIVE_FRESHNESS_MS', 5 * 60_000, 24 * 60 * 60_000)
  }
  return positiveIntegerEnvironment('SPORTS_FIXTURE_FRESHNESS_MS', 6 * 60 * 60_000, 7 * 24 * 60 * 60_000)
}

export function providerSnapshotCacheTtlMs() {
  return positiveIntegerEnvironment('SPORTS_PROVIDER_CACHE_TTL_MS', 60_000, 60 * 60_000)
}

/** Numero de dias a frente que devem ser carregados (rolante, padrao 7). */
export function fixtureWindowDays() {
  return positiveIntegerEnvironment('BETINTEL_FIXTURE_DAYS', 7, 366)
}

/**
 * Janela rolante de fixtures: de hoje ate hoje + BETINTEL_FIXTURE_DAYS.
 * Se BETINTEL_FIXTURE_TO estiver definido explicitamente, ele tem prioridade.
 */
export function fixtureWindow(now = new Date()) {
  const days = fixtureWindowDays()
  const from = now.toISOString().slice(0, 10)
  const horizon = new Date(now)
  horizon.setUTCDate(horizon.getUTCDate() + days)

  const explicitTo = process.env.BETINTEL_FIXTURE_TO?.trim()
  if (explicitTo && !/^\d{4}-\d{2}-\d{2}$/.test(explicitTo)) {
    throw new Error('BETINTEL_FIXTURE_TO deve usar YYYY-MM-DD.')
  }
  return { from, to: explicitTo || horizon.toISOString().slice(0, 10), days }
}

function validateDeployedEnvironment(
  role: RuntimeRole,
  environment: 'staging' | 'production',
) {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('NODE_ENV deve ser production em staging e production.')
  }
  if (!redisKeyPrefix().includes(environment)) {
    throw new Error('REDIS_KEY_PREFIX deve identificar explicitamente o ambiente.')
  }
  if (legacyHttpRoutesEnabled()) {
    throw new Error('ENABLE_LEGACY_HTTP_ROUTES deve permanecer false em ambientes implantados.')
  }

  for (const [name, value] of deployedUrls(role)) {
    const url = new URL(value)
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      throw new Error(`${name} nao pode apontar para loopback em ambiente implantado.`)
    }
  }

  if (role === 'api') {
    if (backendHost() !== '0.0.0.0') {
      throw new Error('BETINTEL_BACKEND_HOST deve ser 0.0.0.0 em ambiente implantado.')
    }
    if (requestIpHashKey().length < 32) {
      throw new Error('REQUEST_IP_HASH_KEY deve ter pelo menos 32 caracteres.')
    }
    for (const origin of corsAllowedOrigins()) {
      if (!origin.startsWith('https://')) {
        throw new Error('CORS_ALLOWED_ORIGINS aceita somente HTTPS em ambiente implantado.')
      }
    }
    for (const [name, value] of [
      ['AUTH0_DOMAIN', auth0ServerConfig().domain],
      ['AUTH0_MANAGEMENT_CLIENT_ID', auth0ServerConfig().managementClientId],
      ['AUTH0_MANAGEMENT_CLIENT_SECRET', auth0ServerConfig().managementClientSecret],
      ['AUTH0_SPA_CLIENT_ID', auth0ServerConfig().spaClientId],
    ]) assertNotPlaceholder(name, value)
  }

  if (role === 'worker' || role === 'scheduler') {
    const apiUser = new URL(databaseUrl()).username
    const processUser = new URL(
      role === 'worker' ? workerDatabaseUrl() : schedulerDatabaseUrl(),
    ).username
    if (apiUser === processUser) {
      throw new Error('Cada processo deve usar um papel PostgreSQL dedicado.')
    }
  }
}

function deployedUrls(role: RuntimeRole): Array<[string, string]> {
  const values: Array<[string, string]> = [['DATABASE_URL', databaseUrl()]]
  if (role === 'api') {
    const redis = redisUrl()
    if (redis) values.push(['REDIS_URL', redis])
  }
  if (role === 'worker') {
    values.push(['WORKER_DATABASE_URL', workerDatabaseUrl()])
    values.push(['BULLMQ_REDIS_URL', bullmqRedisUrl()])
  }
  if (role === 'scheduler') values.push(['SCHEDULER_DATABASE_URL', schedulerDatabaseUrl()])
  return values
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} e obrigatoria.`)
  return value
}

function positiveIntegerEnvironment(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  return positiveInteger(name, process.env[name]?.trim(), fallback, maximum)
}

function positiveInteger(name: string, raw: string | undefined, fallback: number, maximum: number) {
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} deve ser um inteiro positivo de no maximo ${maximum}.`)
  }
  return parsed
}

function booleanEnvironment(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`${name} deve ser true ou false.`)
}

function validateUrl(name: string, value: string, protocols: string[]) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} deve ser uma URL valida.`)
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} usa um protocolo nao permitido.`)
  }
}

function assertNotPlaceholder(name: string, value: string) {
  if (/change-me|placeholder|seu-tenant|example\.com/i.test(value)) {
    throw new Error(`${name} contem valor de exemplo e nao pode ser usado no deploy.`)
  }
}

function isDeployedEnvironment() {
  const environment = deploymentEnvironment()
  return environment === 'staging' || environment === 'production'
}
