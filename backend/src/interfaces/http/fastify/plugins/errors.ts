import fp from 'fastify-plugin'
import { IdentityError } from '../../../../application/identityErrors.js'
import { ApiError, problem } from '../problem.js'
import { captureOperationalError } from '../../../../telemetry/errors.js'
import { activeTraceIds } from '../../../../telemetry/tracing.js'

export const errorPlugin = fp(async (app) => {
  app.setNotFoundHandler(async (request, reply) => {
    return reply
      .code(404)
      .type('application/problem+json')
      .send(problem(request.id, 404, 'not_found', 'Recurso não encontrado.'))
  })

  app.setErrorHandler(async (error, request, reply) => {
    const normalized = error instanceof Error ? error : new Error('UnknownError')
    const mapped = mapUnknownError(error, normalized)
    if (mapped.status >= 500) {
      const actor = request.actor
      request.log.error({
        event: 'http_request_failed',
        requestId: request.id,
        method: request.method,
        route: request.routeOptions.url,
        errorName: normalized.name,
        errorCode: (normalized as Error & { code?: string }).code,
        userId: actor?.userId,
        organizationId: actor?.organizationId,
        ...activeTraceIds(),
      })
      captureOperationalError(normalized, {
        component: 'http',
        requestId: request.id,
        userId: actor?.userId,
        organizationId: actor?.organizationId,
        method: request.method,
        route: request.routeOptions.url,
      })
    }
    return reply
      .code(mapped.status)
      .type('application/problem+json')
      .send(problem(request.id, mapped.status, mapped.code, mapped.detail))
  })
}, { name: 'errors' })

function mapUnknownError(error: unknown, normalized: Error) {
  if (isRateLimitProblem(error)) {
    return {
      status: 429,
      code: 'rate_limit_exceeded',
      detail: 'Muitas requisições. Tente novamente mais tarde.',
    }
  }
  return mapError(normalized)
}

function isRateLimitProblem(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown }
  return (
    candidate.code === 'rate_limit_exceeded'
    || candidate.status === 429
    || candidate.statusCode === 429
  )
}

function mapError(error: Error & { code?: string; statusCode?: number; validation?: unknown }) {
  if (error instanceof IdentityError || error instanceof ApiError) {
    return { status: error.status, code: error.code, detail: error.message }
  }
  if (error.validation) {
    return {
      status: 400,
      code: 'validation_error',
      detail: 'Um ou mais campos são inválidos.',
    }
  }
  if (error.statusCode === 429) {
    return {
      status: 429,
      code: 'rate_limit_exceeded',
      detail: 'Muitas requisições. Tente novamente mais tarde.',
    }
  }
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return { status: 413, code: 'payload_too_large', detail: 'Payload excede o limite permitido.' }
  }
  if (error.statusCode === 415 || error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return {
      status: 415,
      code: 'unsupported_media_type',
      detail: 'Use Content-Type application/json para este recurso.',
    }
  }
  if (error instanceof SyntaxError || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
    return { status: 400, code: 'invalid_json', detail: 'O corpo JSON é inválido.' }
  }
  return {
    status: 500,
    code: 'internal_error',
    detail: 'A operação não pôde ser concluída.',
  }
}
