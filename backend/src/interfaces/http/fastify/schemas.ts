import { Type, type Static } from 'typebox'
import { membershipRoleValues } from '../../../application/authorization.js'

export const UuidSchema = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
})
export const EmptyObjectSchema = Type.Object({}, { additionalProperties: false })
export const AnyObjectSchema = Type.Object({}, { additionalProperties: true })
export const NoContentSchema = Type.Null({ description: 'Sem conteúdo.' })

export const PredictionBodySchema = Type.Object(
  {
    fixtureId: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 200 }), Type.Number()])),
    homeTeam: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    awayTeam: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    competition: Type.Optional(Type.String({ maxLength: 200 })),
    league: Type.Optional(Type.String({ maxLength: 200 })),
    season: Type.Optional(Type.String({ maxLength: 50 })),
    date: Type.Optional(Type.String({ maxLength: 50 })),
  },
  { additionalProperties: false },
)
export type PredictionBody = Static<typeof PredictionBodySchema>

export const FixtureQuerySchema = Type.Object(
  {
    competition: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    from: Type.Optional(Type.String({ minLength: 10, maxLength: 40 })),
    to: Type.Optional(Type.String({ minLength: 10, maxLength: 40 })),
    includePast: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
)

export const OrganizationBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 100 }),
    slug: Type.Optional(Type.String({ minLength: 2, maxLength: 63, pattern: '^[a-z0-9][a-z0-9-]+$' })),
  },
  { additionalProperties: false },
)
export const OrganizationSwitchSchema = Type.Object(
  { organizationId: UuidSchema },
  { additionalProperties: false },
)
export const InvitationBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }),
    role: Type.Union(membershipRoleValues.map((role) => Type.Literal(role))),
    expiresInHours: Type.Optional(Type.Integer({ minimum: 1, maximum: 168 })),
  },
  { additionalProperties: false },
)
export const InvitationAcceptSchema = Type.Object(
  { token: Type.String({ pattern: '^bti_[A-Za-z0-9_-]{43}$' }) },
  { additionalProperties: false },
)
export const RoleBodySchema = Type.Object(
  { role: Type.Union(membershipRoleValues.map((role) => Type.Literal(role))) },
  { additionalProperties: false },
)
export const MemberBodySchema = Type.Object(
  { memberUserId: UuidSchema },
  { additionalProperties: false },
)
export const ReplacementOwnerBodySchema = Type.Object(
  { replacementOwnerUserId: Type.Optional(UuidSchema) },
  { additionalProperties: false },
)
export const EmailBodySchema = Type.Object(
  { email: Type.String({ minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }) },
  { additionalProperties: false },
)
export const IdParamSchema = Type.Object({ id: UuidSchema }, { additionalProperties: false })
export const UserIdParamSchema = Type.Object({ userId: UuidSchema }, { additionalProperties: false })
export const SessionIdParamSchema = Type.Object(
  { sessionId: Type.String({ minLength: 3, maxLength: 200 }) },
  { additionalProperties: false },
)
export const IdempotencyHeadersSchema = Type.Object(
  { 'idempotency-key': Type.String({ minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9._:-]+$' }) },
  { additionalProperties: true },
)
