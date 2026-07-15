import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { OrganizationService } from '../../../../application/organizationService.js'
import { ProblemSchema } from '../problem.js'
import {
  IdParamSchema,
  InvitationAcceptSchema,
  InvitationBodySchema,
  MemberBodySchema,
  OrganizationBodySchema,
  OrganizationSwitchSchema,
  RoleBodySchema,
  UserIdParamSchema,
} from '../schemas.js'
import { actorFrom } from './helpers.js'

const LooseResponse = Type.Object({}, { additionalProperties: true })

export const organizationRoutes: FastifyPluginAsyncTypebox<{
  organizationService: OrganizationService
}> = async (app, { organizationService }) => {
  app.get('/organizations', {
    config: { permission: 'organization.read' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ organizations: Type.Array(LooseResponse) }), default: ProblemSchema },
    },
  }, async (request) => ({ organizations: await organizationService.listOrganizations(actorFrom(request)) }))

  app.post('/organizations', {
    config: { permission: 'organization.create' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], body: OrganizationBodySchema,
      response: { 201: LooseResponse, default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(201).send(
    await organizationService.createOrganization(actorFrom(request), request.body),
  ))

  app.post('/organizations/switch', {
    config: { permission: 'organization.switch' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], body: OrganizationSwitchSchema,
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async (request) => organizationService.switchOrganization(
    actorFrom(request), request.body.organizationId,
  ))

  app.get('/organization/members', {
    config: { permission: 'members.read' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ members: Type.Array(LooseResponse) }), default: ProblemSchema },
    },
  }, async (request) => ({ members: await organizationService.listMembers(actorFrom(request)) }))

  app.get('/organization/invitations', {
    config: { permission: 'members.invite' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }],
      response: { 200: Type.Object({ invitations: Type.Array(LooseResponse) }), default: ProblemSchema },
    },
  }, async (request) => ({ invitations: await organizationService.listInvitations(actorFrom(request)) }))

  app.post('/organization/invitations', {
    config: { permission: 'members.invite' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], body: InvitationBodySchema,
      response: { 201: LooseResponse, default: ProblemSchema },
    },
  }, async (request, reply) => reply.code(201).send(
    await organizationService.invite(actorFrom(request), request.body),
  ))

  app.post('/invitations/accept', {
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], body: InvitationAcceptSchema,
      response: { 200: LooseResponse, default: ProblemSchema },
    },
  }, async (request) => organizationService.acceptInvitation(actorFrom(request), request.body.token))

  app.delete('/organization/invitations/:id', {
    config: { permission: 'members.invite' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], params: IdParamSchema,
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await organizationService.revokeInvitation(actorFrom(request), request.params.id)
    return reply.code(204).send(null)
  })

  app.patch('/organization/members/:userId', {
    config: { permission: 'members.change_role' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], params: UserIdParamSchema,
      body: RoleBodySchema, response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await organizationService.changeRole(actorFrom(request), request.params.userId, request.body.role)
    return reply.code(204).send(null)
  })

  app.delete('/organization/members/:userId', {
    config: { permission: 'members.remove' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], params: UserIdParamSchema,
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await organizationService.removeMember(actorFrom(request), request.params.userId)
    return reply.code(204).send(null)
  })

  app.post('/organization/transfer-ownership', {
    config: { permission: 'members.transfer_ownership' },
    schema: {
      tags: ['organizations'], security: [{ bearerAuth: [] }], body: MemberBodySchema,
      response: { 204: Type.Null(), default: ProblemSchema },
    },
  }, async (request, reply) => {
    await organizationService.transferOwnership(actorFrom(request), request.body.memberUserId)
    return reply.code(204).send(null)
  })
}
