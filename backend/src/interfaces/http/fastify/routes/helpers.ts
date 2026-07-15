import type { FastifyRequest } from 'fastify'
import { ApiError } from '../problem.js'

export function actorFrom(request: FastifyRequest) {
  if (!request.actor) throw new ApiError(401, 'authentication_required', 'Autenticação necessária.')
  return request.actor
}

export function dateBoundary(value: string | undefined, boundary: 'start' | 'end') {
  if (!value) return undefined
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!dateOnly) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiError(400, 'validation_error', 'Filtro de data inválido.')
    }
    return parsed.toISOString()
  }
  const parsed = new Date(
    Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      boundary === 'end' ? 23 : 0,
      boundary === 'end' ? 59 : 0,
      boundary === 'end' ? 59 : 0,
      boundary === 'end' ? 999 : 0,
    ),
  )
  if (
    parsed.getUTCFullYear() !== Number(dateOnly[1]) ||
    parsed.getUTCMonth() !== Number(dateOnly[2]) - 1 ||
    parsed.getUTCDate() !== Number(dateOnly[3])
  ) {
    throw new ApiError(400, 'validation_error', 'Filtro de data inválido.')
  }
  return parsed.toISOString()
}

export function deprecationHeaders(reply: { header(name: string, value: string): unknown }, successor: string) {
  reply.header('Deprecation', 'true')
  reply.header('Sunset', 'Thu, 15 Oct 2026 00:00:00 GMT')
  reply.header('Link', `<${successor}>; rel="successor-version"`)
}
