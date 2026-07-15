import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { PersistenceRepositories } from '../../../../application/ports/persistence.js'
import {
  SystemJobTypes,
  type SystemJobType,
} from '../../../../application/ports/jobs.js'
import { marketDefinitions } from '../../../../markets.js'
import { predictMarkets } from '../../../../prediction.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { PredictionBodySchema } from '../schemas.js'
import { actorFrom, dateBoundary, deprecationHeaders } from './helpers.js'

const LooseResponse = Type.Object({}, { additionalProperties: true })

export const legacyRoutes: FastifyPluginAsyncTypebox<{
  repositories: PersistenceRepositories
}> = async (app, { repositories }) => {
  app.get('/health', {
    config: { public: true },
    schema: { hide: true, response: { 200: Type.Object({ status: Type.String() }) } },
  }, async (_request, reply) => {
    deprecationHeaders(reply, '/v1/health/live')
    return { status: 'ok' }
  })

  for (const path of ['/markets'] as const) {
    app.get(path, { schema: { hide: true } }, async (_request, reply) => {
      deprecationHeaders(reply, '/v1/markets')
      return { markets: Object.values(marketDefinitions) }
    })
  }

  app.get('/competitions', { schema: { hide: true } }, async (_request, reply) => {
    deprecationHeaders(reply, '/v1/competitions')
    return { competitions: await repositories.sports.listCompetitions() }
  })

  app.get('/fixtures', {
    schema: {
      hide: true,
      querystring: Type.Object({
        competition: Type.Optional(Type.String()), from: Type.Optional(Type.String()),
        to: Type.Optional(Type.String()), includePast: Type.Optional(Type.Boolean()),
        refresh: Type.Optional(Type.Boolean()),
      }, { additionalProperties: false }),
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async (request, reply) => {
    deprecationHeaders(reply, '/v1/fixtures')
    if (request.query.refresh) {
      throw new ApiError(
        409,
        'operation_moved_to_job',
        'Atualização síncrona foi removida. Use o job administrativo de sports-sync.',
      )
    }
    const fixtures = await repositories.sports.listFixtures({
      competition: request.query.competition,
      from: dateBoundary(request.query.from, 'start'),
      to: dateBoundary(request.query.to, 'end'),
      includePast: request.query.includePast,
    })
    return {
      fixtures,
      sourceProvider: fixtures[0]?.sourceProvider ?? 'postgresql',
      updatedAt: fixtures[0]?.updatedAt ?? new Date().toISOString(),
      warnings: ['Rota legada; migre para /v1/fixtures antes de 15/10/2026.'],
    }
  })

  for (const path of ['/predict', '/v1/predict'] as const) {
    app.post(path, {
      schema: { hide: true, body: PredictionBodySchema, response: { 200: LooseResponse, default: ProblemSchema } },
    }, async (request, reply) => {
      deprecationHeaders(reply, '/v1/predictions')
      const body = request.body
      let enriched = body
      if ((!body.homeTeam || !body.awayTeam) && body.fixtureId !== undefined) {
        const fixture = await repositories.sports.findFixture(body.fixtureId)
        if (fixture) enriched = {
          ...body,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          competition: fixture.competition,
          league: fixture.league,
          season: fixture.season,
          date: fixture.isoDate,
        }
      }
      if (!enriched.homeTeam || !enriched.awayTeam) {
        throw new ApiError(400, 'invalid_request', 'Fixture ou times válidos são obrigatórios.')
      }
      const model = await repositories.models.getActiveModel()
      if (!model) throw new ApiError(503, 'model_not_ready', 'Modelo ativo ainda não disponível.')
      return predictMarkets(model, enriched as Parameters<typeof predictMarkets>[1])
    })
  }

  registerReport(app, '/evaluation', '/v1/evaluations/latest', 'evaluation', repositories)
  registerReport(app, '/backtest', '/v1/backtests/latest', 'backtest', repositories)
  registerLegacyJob(app, '/sync-data', '/v1/admin/jobs/sports-sync', SystemJobTypes.SPORTS_SYNC, repositories)
  registerLegacyJob(app, '/train', '/v1/admin/jobs/model-training', SystemJobTypes.MODEL_TRAINING, repositories)
}

function registerReport(
  app: Parameters<FastifyPluginAsyncTypebox>[0],
  path: string,
  successor: string,
  kind: 'evaluation' | 'backtest',
  repositories: PersistenceRepositories,
) {
  app.get(path, { schema: { hide: true } }, async (_request, reply) => {
    deprecationHeaders(reply, successor)
    const report = kind === 'evaluation'
      ? await repositories.models.getLatestEvaluation('evaluation')
      : await repositories.models.getLatestEvaluation('backtest')
    if (!report) throw new ApiError(404, `${kind}_not_ready`, 'Relatório ainda não disponível.')
    return report
  })
}

function registerLegacyJob(
  app: Parameters<FastifyPluginAsyncTypebox>[0],
  path: string,
  successor: string,
  type: SystemJobType,
  repositories: PersistenceRepositories,
) {
  app.post(path, {
    config: { permission: 'system.manage' },
    schema: { hide: true },
  }, async (request, reply) => {
    deprecationHeaders(reply, successor)
    const job = await repositories.jobs.enqueueSystemJob(actorFrom(request), type, `legacy-${request.id}`)
    return reply.code(202).send(job)
  })
}
