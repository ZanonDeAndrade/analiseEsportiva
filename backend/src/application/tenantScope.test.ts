import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ActorContext } from './ports/identity.js'
import {
  assertOrganizationScope,
  assertOrganizationObjectKey,
  organizationCacheKey,
  organizationJob,
  organizationObjectKey,
} from './tenantScope.js'

const actor = {
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'member',
  provider: 'auth0',
  subject: 'auth0|tenant-test',
  sessionId: 'session-test',
  tokenExpiresAt: '2027-01-01T00:00:00.000Z',
} satisfies ActorContext

test('cache, objeto e job recebem organizationId somente do ator', () => {
  assert.equal(
    organizationCacheKey('test', actor, 'analysis', 'resource-1'),
    'test:org:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:analysis:resource-1',
  )
  assert.equal(
    organizationObjectKey(actor, 'export-1', 'report.csv'),
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/exports/export-1/report.csv',
  )
  assert.deepEqual(organizationJob(actor, { resourceId: 'resource-1' }), {
    scope: 'organization',
    organizationId: actor.organizationId,
    requestedByUserId: actor.userId,
    payload: { resourceId: 'resource-1' },
  })
})

test('worker e storage recusam recurso de outra organizacao', () => {
  assert.throws(
    () => assertOrganizationScope(actor.organizationId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    /Recurso não encontrado/,
  )
  assert.throws(
    () =>
      assertOrganizationObjectKey(
        actor,
        'organizations/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/exports/export-1/report.csv',
      ),
    /Arquivo não encontrado/,
  )
})
