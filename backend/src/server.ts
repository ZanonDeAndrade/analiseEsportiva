import {
  auth0ServerConfig,
  backendHost,
  backendPort,
  corsAllowedOrigins,
  httpBodyLimit,
  httpRateLimitMax,
  httpRateLimitWindow,
  httpRequestTimeoutMs,
  httpTrustProxyHops,
  legacyHttpRoutesEnabled,
  metricsBearerToken,
  platformAdminSubjects,
  redisKeyPrefix,
  redisUrl,
  readinessTimeoutMs,
  requestIpHashKey,
  shutdownGracePeriodMs,
  validateRuntimeConfiguration,
} from './config.js'
import { Redis } from 'ioredis'
import { IdentityService } from './application/identityService.js'
import { OrganizationService } from './application/organizationService.js'
import { createBetIntelHttpServer } from './httpApp.js'
import {
  assertSafeRuntimeDatabaseRole,
  createDatabaseConnection,
} from './infrastructure/database/client.js'
import { createPostgresRepositories } from './infrastructure/database/repositories.js'
import { Auth0IdentityProvider } from './infrastructure/identity/auth0IdentityProvider.js'
import { installGracefulShutdown } from './runtime/gracefulShutdown.js'
import { shutdownTelemetry } from './telemetry/instrumentation.js'
import { captureOperationalError } from './telemetry/errors.js'
import { telemetryMetrics } from './telemetry/metrics.js'

validateRuntimeConfiguration('api')
const host = backendHost()
const port = backendPort()
const connection = createDatabaseConnection()
try {
  await assertSafeRuntimeDatabaseRole(connection)
} catch (error) {
  await connection.close()
  throw error
}
const repositories = createPostgresRepositories(connection)
const identityProvider = new Auth0IdentityProvider(auth0ServerConfig())
const identityService = new IdentityService(identityProvider, repositories.identity)
const organizationService = new OrganizationService(repositories.organizations, identityProvider)
const configuredRedisUrl = redisUrl()
const rateLimitRedis = configuredRedisUrl
  ? new Redis(configuredRedisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectionName: `${redisKeyPrefix()}:http-rate-limit`,
    })
  : undefined
rateLimitRedis?.on('error', (error) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'redis_connection_error',
    code: (error as NodeJS.ErrnoException).code ?? 'redis_error',
  }))
  telemetryMetrics.recordDependency('redis', false)
  captureOperationalError(error, { component: 'redis' })
})
const server = createBetIntelHttpServer({
  connection,
  repositories,
  identityService,
  organizationService,
  corsAllowedOrigins: corsAllowedOrigins(),
  requestIpHashKey: requestIpHashKey(),
  legacyRoutesEnabled: legacyHttpRoutesEnabled(),
  bodyLimit: httpBodyLimit(),
  requestTimeoutMs: httpRequestTimeoutMs(),
  rateLimitMax: httpRateLimitMax(),
  rateLimitWindow: httpRateLimitWindow(),
  rateLimitRedis,
  readinessRedis: rateLimitRedis,
  readinessTimeoutMs: readinessTimeoutMs(),
  redisNamespace: `${redisKeyPrefix()}:http-rate-limit:`,
  trustProxyHops: httpTrustProxyHops(),
  metricsBearerToken: metricsBearerToken(),
  platformAdminSubjects: platformAdminSubjects(),
})

try {
  await server.listen({ port, host })
} catch (error) {
  await server.close().catch(() => undefined)
  await connection.close()
  throw error
}
console.log(JSON.stringify({ event: 'http_started', host, port }))

installGracefulShutdown({
  processName: 'http',
  timeoutMs: shutdownGracePeriodMs(),
  close: async () => {
    await server.close()
    await connection.close()
    await shutdownTelemetry()
  },
})
