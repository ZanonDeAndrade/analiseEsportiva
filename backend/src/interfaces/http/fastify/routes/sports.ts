import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { PersistenceRepositories } from '../../../../application/ports/persistence.js'
import { marketDefinitions } from '../../../../markets.js'
import { predictMarkets } from '../../../../prediction.js'
import type { PredictionRequest } from '../../../../schemas.js'
import { ApiError, ProblemSchema } from '../problem.js'
import {
  FixtureQuerySchema,
  PredictionBodySchema,
  type PredictionBody,
} from '../schemas.js'
import { dateBoundary } from './helpers.js'
import { telemetryMetrics } from '../../../../telemetry/metrics.js'

const LooseResponse = Type.Object({}, { additionalProperties: true })

export const sportsRoutes: FastifyPluginAsyncTypebox<{
  repositories: PersistenceRepositories
}> = async (app, { repositories }) => {
  app.get('/markets', {
    schema: {
      tags: ['sports'],
      security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ markets: Type.Array(LooseResponse) }), default: ProblemSchema },
    },
  }, async () => ({ markets: Object.values(marketDefinitions) }))

  app.get('/competitions', {
    schema: {
      tags: ['sports'],
      security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ competitions: Type.Array(LooseResponse) }), default: ProblemSchema },
    },
  }, async () => ({ competitions: await repositories.sports.listCompetitions() }))

  app.get('/fixtures', {
    schema: {
      tags: ['fixtures'],
      security: [{ bearerAuth: [] }],
      querystring: FixtureQuerySchema,
      response: {
        200: Type.Object({
          fixtures: Type.Array(LooseResponse),
          sourceProvider: Type.String(),
          updatedAt: Type.String(),
          warnings: Type.Array(Type.String()),
        }),
        default: ProblemSchema,
      },
    },
  }, async (request) => {
    const fixtures = await repositories.sports.listFixtures({
      competition: request.query.competition,
      from: dateBoundary(request.query.from, 'start'),
      to: dateBoundary(request.query.to, 'end'),
      includePast: request.query.includePast,
    })
    const freshness = await repositories.sports.dataFreshnessSummary()
    const sync = await repositories.systemState.get<{ generatedAt?: string; sourceProvider?: string }>('sports_sync')
    const warnings = freshness.stale > 0
      ? [`${freshness.stale} registro(s) vencido(s) foram bloqueados e não são apresentados como atuais.`]
      : []
    return {
      fixtures,
      sourceProvider: fixtures[0]?.sourceProvider ?? sync?.sourceProvider ?? 'postgresql',
      updatedAt: fixtures[0]?.updatedAt ?? sync?.generatedAt ?? freshness.checkedAt,
      warnings,
    }
  })

  app.get('/fixtures/:id', {
    schema: {
      tags: ['fixtures'],
      security: [{ bearerAuth: [] }],
      params: Type.Object({ id: Type.String({ minLength: 1, maxLength: 200 }) }),
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async (request) => {
    const fixture = await repositories.sports.findFixture(request.params.id)
    if (!fixture) throw new ApiError(404, 'not_found', 'Fixture não encontrada.')
    if (fixture.freshness !== 'current') {
      throw new ApiError(409, 'stale_sports_data', 'A fixture existe, mas seu frescor venceu e ela não pode ser apresentada como atual.')
    }
    return fixture
  })

  app.post('/predictions', {
    schema: {
      tags: ['predictions'],
      security: [{ bearerAuth: [] }],
      body: PredictionBodySchema,
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async (request) => {
    const predictionRequest = await enrichPredictionRequest(repositories, request.body)
    if (!predictionRequest.homeTeam || !predictionRequest.awayTeam) {
      throw new ApiError(
        400,
        'invalid_request',
        'Fixture ou times válidos são obrigatórios.',
      )
    }
    const model = await repositories.models.getActiveModel()
    if (!model) {
      throw new ApiError(
        503,
        'model_not_ready',
        'Nenhum modelo pronto está disponível. Solicite treinamento pelo job administrativo.',
      )
    }
    const prediction = predictMarkets(model, predictionRequest as PredictionRequest)
    telemetryMetrics.recordPrediction(prediction.ignoredMarkets)
    return prediction
  })

  app.get('/evaluations/latest', {
    schema: {
      tags: ['evaluations'],
      security: [{ bearerAuth: [] }],
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async () => {
    const evaluation = await repositories.models.getLatestEvaluation('evaluation')
    if (!evaluation) throw new ApiError(404, 'evaluation_not_ready', 'Avaliação ainda não disponível.')
    return evaluation
  })

  app.get('/backtests/latest', {
    schema: {
      tags: ['evaluations'],
      security: [{ bearerAuth: [] }],
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async () => {
    const report = await repositories.models.getLatestEvaluation('backtest')
    if (!report) throw new ApiError(404, 'backtest_not_ready', 'Backtest ainda não disponível.')
    return report
  })

  app.get('/models/active', {
    schema: {
      tags: ['models'],
      security: [{ bearerAuth: [] }],
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async () => {
    const model = await repositories.models.getActiveModel()
    if (!model) throw new ApiError(404, 'model_not_ready', 'Modelo ativo ainda não disponível.')
    return {
      modelVersionId: model.modelVersionId,
      datasetVersionId: model.datasetVersionId,
      codeVersion: model.provenance.codeVersion,
      featureSetVersion: model.provenance.featureSetVersion,
      modelSchemaVersion: model.provenance.modelSchemaVersion,
      hyperparameters: model.provenance.hyperparameters,
      artifactFingerprint: model.provenance.artifactFingerprint,
      trainingPeriod: model.provenance.trainingPeriod,
      version: model.version,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      minRows: model.minRows,
      trainingRows: model.trainingRows,
      sourceProviders: model.sourceProviders,
      competitions: model.competitions,
      limitations: [
        'Modelo probabilístico baseado exclusivamente nas features e fontes versionadas.',
        'Não garante resultados e não constitui recomendação de aposta ou financeira.',
      ],
      markets: Object.values(model.markets).map((market) => ({
        id: market.market,
        status: market.status,
        sampleSize: market.usableRows,
        reason: market.reason,
      })),
    }
  })
}

async function enrichPredictionRequest(
  repositories: PersistenceRepositories,
  body: PredictionBody,
): Promise<PredictionBody> {
  if (body.homeTeam && body.awayTeam) return body
  if (body.fixtureId === undefined) return body
  const fixture = await repositories.sports.findFixture(body.fixtureId)
  if (!fixture) return body
  if (fixture.freshness !== 'current') {
    throw new ApiError(409, 'stale_sports_data', 'A fixture está desatualizada; sincronize o provedor antes de gerar análise.')
  }
  return {
    ...body,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    competition: fixture.competition,
    league: fixture.league,
    season: fixture.season,
    date: fixture.isoDate,
  }
}
