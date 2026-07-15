import { Type, type Static } from 'typebox'

export const ProblemSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer(),
    code: Type.String(),
    detail: Type.String(),
    requestId: Type.String(),
  },
  { additionalProperties: false },
)

export type Problem = Static<typeof ProblemSchema>

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function problem(
  requestId: string,
  status: number,
  code: string,
  detail: string,
): Problem {
  return {
    type: `https://betintel.ai/problems/${code}`,
    title: titleFor(status),
    status,
    code,
    detail,
    requestId,
  }
}

function titleFor(status: number) {
  if (status === 400) return 'Requisição inválida'
  if (status === 401) return 'Não autorizado'
  if (status === 403) return 'Acesso negado'
  if (status === 404) return 'Não encontrado'
  if (status === 413) return 'Payload excessivo'
  if (status === 415) return 'Tipo de conteúdo não suportado'
  if (status === 429) return 'Limite excedido'
  if (status === 504) return 'Tempo limite excedido'
  return 'Erro'
}
