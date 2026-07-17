import { randomUUID } from 'node:crypto'
import Fastify, { LogController, type FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import type { Redis } from 'ioredis'
import type { IdentityService } from './application/identityService.js'
import type { OrganizationService } from './application/organizationService.js'
import type { PersistenceRepositories } from './application/ports/persistence.js'
import type { DatabaseConnection } from './infrastructure/database/client.js'
import { authenticationPlugin } from './interfaces/http/fastify/plugins/authentication.js'
import { authorizationPlugin } from './interfaces/http/fastify/plugins/authorization.js'
import { errorPlugin } from './interfaces/http/fastify/plugins/errors.js'
import { safeLoggingPlugin } from './interfaces/http/fastify/plugins/logging.js'
import { observabilityPlugin } from './interfaces/http/fastify/plugins/observability.js'
import { rateLimitPlugin } from './interfaces/http/fastify/plugins/rateLimit.js'
import { securityPlugin } from './interfaces/http/fastify/plugins/security.js'
import { tenancyPlugin } from './interfaces/http/fastify/plugins/tenancy.js'
import { responseTimeoutPlugin } from './interfaces/http/fastify/plugins/timeout.js'
import { accountRoutes } from './interfaces/http/fastify/routes/account.js'
import { adminRoutes } from './interfaces/http/fastify/routes/admin.js'
import {
  billingRoutes,
  type BillingPortalGateway,
} from './interfaces/http/fastify/routes/billing.js'
import { healthRoutes } from './interfaces/http/fastify/routes/health.js'
import { legacyRoutes } from './interfaces/http/fastify/routes/legacy.js'
import { observabilityRoutes } from './interfaces/http/fastify/routes/observability.js'
import { organizationRoutes } from './interfaces/http/fastify/routes/organizations.js'
import { sportsRoutes } from './interfaces/http/fastify/routes/sports.js'
import { legalRoutes } from './interfaces/http/fastify/routes/legal.js'
import { workspaceRoutes } from './interfaces/http/fastify/routes/workspace.js'
import { privacyRoutes } from './interfaces/http/fastify/routes/privacy.js'
import { supportRoutes } from './interfaces/http/fastify/routes/support.js'
import { PrivacyCoordinator } from './application/privacyCoordinator.js'
import type { PrivateCachePurger, PrivateObjectStorage } from './application/ports/privacy.js'
import './interfaces/http/fastify/types.js'

export interface HttpServerDependencies {
  connection: DatabaseConnection
  repositories: PersistenceRepositories
  identityService: IdentityService
  organizationService: OrganizationService
  corsAllowedOrigins: string[]
  requestIpHashKey: string
  billingPortal?: BillingPortalGateway
  environment?: string
  legacyRoutesEnabled?: boolean
  bodyLimit?: number
  requestTimeoutMs?: number
  rateLimitMax?: number
  rateLimitWindow?: string
  logger?: boolean
  rateLimitRedis?: Redis
  redisNamespace?: string
  readinessRedis?: { ping(): Promise<unknown> }
  readinessTimeoutMs?: number
  trustProxyHops?: number
  metricsBearerToken?: string
  platformAdminSubjects?: string[]
  privateObjectStorage?: PrivateObjectStorage
  privateCachePurger?: PrivateCachePurger
}

export function createBetIntelHttpServer(
  dependencies: HttpServerDependencies,
): FastifyInstance {
  const privacy = new PrivacyCoordinator(
    dependencies.repositories.privacy,
    dependencies.identityService,
    dependencies.privateObjectStorage,
    dependencies.privateCachePurger,
  )
  const environment = dependencies.environment ?? process.env.NODE_ENV ?? 'development'
  const app = Fastify({
    trustProxy: environment === 'staging' || environment === 'production'
      ? dependencies.trustProxyHops ?? 1
      : false,
    bodyLimit: dependencies.bodyLimit ?? 1_000_000,
    requestTimeout: dependencies.requestTimeoutMs ?? 15_000,
    connectionTimeout: 5_000,
    keepAliveTimeout: 5_000,
    logController: new LogController({ disableRequestLogging: true }),
    logger: dependencies.logger === false
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers.x-api-key',
              'request.headers.authorization',
              'request.headers.cookie',
              'req.headers.set-cookie',
              'req.body',
              'request.body',
              '*.password',
              '*.token',
              '*.secret',
              '*.email',
              '*.payload',
            ],
            censor: '[REDACTED]',
          },
        },
    genReqId(request) {
      const supplied = request.headers['x-request-id']
      return typeof supplied === 'string' && UUID_PATTERN.test(supplied)
        ? supplied
        : randomUUID()
    },
  }).withTypeProvider<TypeBoxTypeProvider>()

  void app.register(securityPlugin, { allowedOrigins: dependencies.corsAllowedOrigins })
  void app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'BetIntel AI API',
        description: 'API acadêmica de análise probabilística; não recomenda apostas nem garante resultados.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  })
  if (environment !== 'production') {
    void app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: false },
    })
  }

  void app.register(errorPlugin)
  void app.register(observabilityPlugin)
  void app.register(safeLoggingPlugin)
  void app.register(responseTimeoutPlugin, {
    defaultTimeoutMs: dependencies.requestTimeoutMs ?? 15_000,
  })
  void app.register(rateLimitPlugin, {
    max: dependencies.rateLimitMax ?? 120,
    timeWindow: dependencies.rateLimitWindow ?? '1 minute',
    redis: dependencies.rateLimitRedis,
    namespace: dependencies.redisNamespace,
  })

  if (dependencies.rateLimitRedis) {
    app.addHook('onClose', async () => {
      await dependencies.rateLimitRedis?.quit().catch(() => dependencies.rateLimitRedis?.disconnect())
    })
  }
  void app.register(authenticationPlugin, {
    identityService: dependencies.identityService,
    requestIpHashKey: dependencies.requestIpHashKey,
    platformAdminSubjects: dependencies.platformAdminSubjects,
  })
  void app.register(tenancyPlugin)
  void app.register(authorizationPlugin)

  void app.register(async (v1) => {
    await v1.register(healthRoutes, {
      connection: dependencies.connection,
      models: dependencies.repositories.models,
      redisCheck: dependencies.readinessRedis
        ? () => dependencies.readinessRedis!.ping()
        : undefined,
      requireRedis: Boolean(dependencies.readinessRedis)
        || environment === 'staging'
        || environment === 'production',
      dependencyTimeoutMs: dependencies.readinessTimeoutMs ?? 1_500,
    })
    await v1.register(accountRoutes, { identityService: dependencies.identityService, privacy })
    await v1.register(organizationRoutes, {
      organizationService: dependencies.organizationService,
    })
    await v1.register(sportsRoutes, { repositories: dependencies.repositories })
    await v1.register(adminRoutes, {
      jobs: dependencies.repositories.jobs,
      sports: dependencies.repositories.sports,
      models: dependencies.repositories.models,
      operations: dependencies.repositories.operations,
    })
    await v1.register(billingRoutes, { billingPortal: dependencies.billingPortal })
    await v1.register(legalRoutes, {
      legal: dependencies.repositories.legal,
      requestIpHashKey: dependencies.requestIpHashKey,
    })
    await v1.register(workspaceRoutes, { repositories: dependencies.repositories })
    await v1.register(privacyRoutes, { privacy, operations: dependencies.repositories.operations })
    await v1.register(supportRoutes, { operations: dependencies.repositories.operations })
    await v1.register(observabilityRoutes, {
      connection: dependencies.connection,
      metricsBearerToken: dependencies.metricsBearerToken,
    })
  }, { prefix: '/v1' })

  if (dependencies.legacyRoutesEnabled === true) {
    void app.register(legacyRoutes, { repositories: dependencies.repositories })
  }

  return app
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
