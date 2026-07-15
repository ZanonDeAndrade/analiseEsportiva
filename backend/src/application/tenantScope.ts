import { IdentityError } from './identityErrors.js'
import type { ActorContext } from './ports/identity.js'

export interface OrganizationJobEnvelope<T> {
  scope: 'organization'
  organizationId: string
  requestedByUserId: string
  payload: T
}

export function organizationCacheKey(
  environment: string,
  actor: ActorContext,
  namespace: string,
  resourceId: string,
) {
  return [environment, 'org', actor.organizationId, safePart(namespace), safePart(resourceId)].join(':')
}

export function organizationObjectKey(actor: ActorContext, exportId: string, filename: string) {
  return `organizations/${actor.organizationId}/exports/${safePart(exportId)}/${safePart(filename)}`
}

export function assertOrganizationObjectKey(actor: ActorContext, objectKey: string) {
  const expectedPrefix = `organizations/${actor.organizationId}/exports/`
  if (!objectKey.startsWith(expectedPrefix) || objectKey.includes('..')) {
    throw new IdentityError('not_found', 'Arquivo não encontrado.', 404)
  }
}

export function organizationJob<T>(actor: ActorContext, payload: T): OrganizationJobEnvelope<T> {
  return {
    scope: 'organization',
    organizationId: actor.organizationId,
    requestedByUserId: actor.userId,
    payload,
  }
}

export function assertOrganizationScope(expectedOrganizationId: string, actualOrganizationId: string) {
  if (expectedOrganizationId !== actualOrganizationId) {
    throw new IdentityError('not_found', 'Recurso não encontrado.', 404)
  }
}

function safePart(value: string) {
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(value)) {
    throw new IdentityError('invalid_request', 'Identificador de escopo inválido.', 400)
  }
  return value
}
