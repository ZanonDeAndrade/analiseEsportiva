import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { LegalRepository } from '../../../../application/ports/legal.js'
import { legalAcceptancePurposes, legalDocumentTypes } from '../../../../application/ports/legal.js'
import { hashRemoteAddress } from '../plugins/authentication.js'
import { ProblemSchema } from '../problem.js'
import { IdempotencyHeadersSchema, UuidSchema } from '../schemas.js'
import { actorFrom } from './helpers.js'

const LooseObject = Type.Object({}, { additionalProperties: true })
const DocumentTypeSchema = Type.Union(legalDocumentTypes.map((value) => Type.Literal(value)))
const AcceptancePurposeSchema = Type.Union(
  legalAcceptancePurposes.map((value) => Type.Literal(value)),
)

const AcceptanceBodySchema = Type.Object({
  purpose: AcceptancePurposeSchema,
  documents: Type.Array(Type.Object({
    type: DocumentTypeSchema,
    version: Type.String({ minLength: 1, maxLength: 50 }),
    contentHash: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  }, { additionalProperties: false }), { minItems: 3, maxItems: 6 }),
  declarations: Type.Object({
    age18: Type.Boolean(),
    termsAndPrivacy: Type.Boolean(),
    risk: Type.Boolean(),
    recurringBilling: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false }),
  evidence: Type.Object({
    origin: Type.Union([
      Type.Literal('signup'),
      Type.Literal('first_access'),
      Type.Literal('material_update'),
      Type.Literal('subscription'),
    ]),
    planKey: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    billingCycle: Type.Optional(Type.Union([Type.Literal('month'), Type.Literal('year')])),
    priceMinor: Type.Optional(Type.Integer({ minimum: 0 })),
    currency: Type.Optional(Type.String({ pattern: '^[A-Z]{3}$' })),
    transactionId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    riskVersion: Type.String({ minLength: 1, maxLength: 50 }),
    privacyVersion: Type.String({ minLength: 1, maxLength: 50 }),
  }, { additionalProperties: false }),
}, { additionalProperties: false })

export const legalRoutes: FastifyPluginAsyncTypebox<{
  legal: LegalRepository
  requestIpHashKey: string
}> = async (app, { legal, requestIpHashKey }) => {
  app.get('/legal/documents', {
    config: { public: true },
    schema: {
      tags: ['legal'],
      querystring: Type.Object({ type: Type.Optional(DocumentTypeSchema) }, { additionalProperties: false }),
      response: { 200: Type.Object({ documents: Type.Array(LooseObject) }), default: ProblemSchema },
    },
  }, async (request) => ({ documents: await legal.listDocuments(request.query.type) }))

  app.get('/legal/status', {
    schema: {
      tags: ['legal'], security: [{ bearerAuth: [] }],
      response: { 200: LooseObject, default: ProblemSchema },
    },
  }, async (request) => legal.acceptanceStatus(actorFrom(request)))

  app.post('/legal/acceptances', {
    schema: {
      tags: ['legal'], security: [{ bearerAuth: [] }],
      headers: IdempotencyHeadersSchema,
      body: AcceptanceBodySchema,
      response: {
        201: Type.Object({ acceptedAt: Type.String(), acceptances: Type.Array(LooseObject) }),
        default: ProblemSchema,
      },
    },
  }, async (request, reply) => {
    const acceptances = await legal.recordAcceptances(actorFrom(request), {
      ...request.body,
      idempotencyKey: String(request.headers['idempotency-key']),
      evidence: {
        ...request.body.evidence,
        ipHash: hashRemoteAddress(request.ip, requestIpHashKey),
        userAgent: headerValue(request.headers['user-agent']),
      },
    })
    const acceptedAt = acceptances.map((item) => item.acceptedAt).sort().at(-1)
    if (!acceptedAt || acceptances.length !== request.body.documents.length) {
      throw new Error('legal_acceptance_incomplete')
    }
    return reply.code(201).send({ acceptedAt, acceptances })
  })

  app.get('/legal/acceptances', {
    schema: {
      tags: ['legal'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ acceptances: Type.Array(LooseObject) }), default: ProblemSchema },
    },
  }, async (request) => ({ acceptances: await legal.listAcceptances(actorFrom(request)) }))

  app.get('/legal/acceptances/:id/export', {
    schema: {
      tags: ['legal'], security: [{ bearerAuth: [] }],
      params: Type.Object({ id: UuidSchema }, { additionalProperties: false }),
      response: { 200: LooseObject, default: ProblemSchema },
    },
  }, async (request, reply) => {
    const acceptance = await legal.findAcceptance(actorFrom(request), request.params.id)
    if (!acceptance) return reply.code(404).send({
      type: 'about:blank', title: 'Não encontrado', status: 404,
      detail: 'Evidência de aceite não encontrada.', code: 'not_found', requestId: request.id,
    })
    return {
      exportedAt: new Date().toISOString(),
      acceptance,
      verification: {
        contentHash: acceptance.contentHash,
        documentUrl: acceptance.documentUrl,
        note: 'O hash identifica a versão imutável aceita; o horário do aceite foi gerado no servidor.',
      },
    }
  })
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
