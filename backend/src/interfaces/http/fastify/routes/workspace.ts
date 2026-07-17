import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { PersistenceRepositories } from '../../../../application/ports/persistence.js'
import { ApiError, ProblemSchema } from '../problem.js'
import { IdParamSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'

const FiltersSchema = Type.Object({
  league: Type.String({ maxLength: 80 }),
  period: Type.String({ maxLength: 30 }),
  market: Type.String({ maxLength: 80 }),
  query: Type.String({ maxLength: 200 }),
}, { additionalProperties: false })

const LooseResponse = Type.Object({}, { additionalProperties: true })

export const workspaceRoutes: FastifyPluginAsyncTypebox<{
  repositories: PersistenceRepositories
}> = async (app, { repositories }) => {
  app.get('/saved-queries', {
    config: { permission: 'private.read' },
    schema: { tags: ['workspace'], security: [{ bearerAuth: [] }], response: { 200: Type.Object({ queries: Type.Array(LooseResponse) }), default: ProblemSchema } },
  }, async (request) => ({ queries: await repositories.workspace.listSavedQueries(actorFrom(request)) }))

  app.post('/saved-queries', {
    config: { permission: 'private.write' },
    schema: {
      tags: ['workspace'], security: [{ bearerAuth: [] }],
      body: Type.Object({ name: Type.String({ minLength: 2, maxLength: 80 }), filters: FiltersSchema }, { additionalProperties: false }),
      response: { 201: LooseResponse, default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(201).send(
    await repositories.workspace.createSavedQuery(actorFrom(request), request.body.name.trim(), request.body.filters),
  ))

  app.delete('/saved-queries/:id', {
    config: { permission: 'private.write' },
    schema: { tags: ['workspace'], security: [{ bearerAuth: [] }], params: IdParamSchema, response: { 204: Type.Null(), default: ProblemSchema } },
  }, async (request, reply) => {
    if (!await repositories.workspace.deleteSavedQuery(actorFrom(request), request.params.id)) {
      throw new ApiError(404, 'not_found', 'Consulta salva nao encontrada nesta organizacao.')
    }
    return reply.code(204).send(null)
  })

  app.get('/alerts', {
    config: { permission: 'private.read' },
    schema: { tags: ['workspace'], security: [{ bearerAuth: [] }], response: { 200: Type.Object({ alerts: Type.Array(LooseResponse), deliveryConfigured: Type.Boolean() }), default: ProblemSchema } },
  }, async (request) => ({
    alerts: await repositories.workspace.listAlertRules(actorFrom(request)),
    deliveryConfigured: false,
  }))

  app.post('/alerts', {
    config: { permission: 'private.write' },
    schema: {
      tags: ['workspace'], security: [{ bearerAuth: [] }],
      body: Type.Object({
        name: Type.String({ minLength: 2, maxLength: 80 }),
        savedQueryId: Type.Optional(Type.String({ format: 'uuid' })),
        channel: Type.Union([Type.Literal('email'), Type.Literal('in_app')]),
      }, { additionalProperties: false }),
      response: { 201: LooseResponse, default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(201).send(
    await repositories.workspace.createAlertRule(actorFrom(request), { ...request.body, name: request.body.name.trim() }),
  ))

  app.delete('/alerts/:id', {
    config: { permission: 'private.write' },
    schema: { tags: ['workspace'], security: [{ bearerAuth: [] }], params: IdParamSchema, response: { 204: Type.Null(), default: ProblemSchema } },
  }, async (request, reply) => {
    if (!await repositories.workspace.deleteAlertRule(actorFrom(request), request.params.id)) {
      throw new ApiError(404, 'not_found', 'Alerta nao encontrado nesta organizacao.')
    }
    return reply.code(204).send(null)
  })

  app.post('/exports/fixtures', {
    config: { permission: 'exports.create' },
    schema: {
      tags: ['workspace'], security: [{ bearerAuth: [] }],
      body: Type.Object({
        competition: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
        from: Type.Optional(Type.String({ minLength: 10, maxLength: 40 })),
        to: Type.Optional(Type.String({ minLength: 10, maxLength: 40 })),
      }, { additionalProperties: false }),
      response: { 200: Type.Object({ fileName: Type.String(), mimeType: Type.String(), contentBase64: Type.String(), generatedAt: Type.String(), validUntil: Type.String(), rows: Type.Integer() }), default: ProblemSchema },
    },
  }, async (request, reply) => {
    const fixtures = await repositories.sports.listFixtures({ ...request.body, includePast: true })
    const generatedAt = new Date().toISOString()
    const header = ['id', 'competicao', 'temporada', 'inicio_utc', 'status', 'mandante', 'visitante', 'fonte', 'atualizado_utc']
    const rows = fixtures.map((fixture) => [
      fixture.id, fixture.competition, fixture.season ?? '', fixture.isoDate, fixture.status,
      fixture.homeTeam, fixture.awayTeam, fixture.sourceProvider, fixture.updatedAt,
    ].map(csvCell).join(','))
    const csv = `\uFEFF${[header.join(','), ...rows].join('\r\n')}`
    void reply.headers({ 'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache' })
    return {
      fileName: `betintel-fixtures-${generatedAt.slice(0, 10)}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
      generatedAt,
      validUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
      rows: fixtures.length,
    }
  })
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
