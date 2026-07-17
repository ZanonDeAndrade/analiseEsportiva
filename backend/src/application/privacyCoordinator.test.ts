import assert from 'node:assert/strict'
import test from 'node:test'
import type { IdentityService } from './identityService.js'
import { PrivacyCoordinator, PrivacyRetentionCoordinator } from './privacyCoordinator.js'
import type { ActorContext } from './ports/identity.js'
import type { PrivacyRepository } from './ports/privacy.js'

const actor: ActorContext = {
  userId: '11111111-1111-4111-8111-111111111111', organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'owner', provider: 'auth0', subject: 'auth0|privacy-test', sessionId: 'session',
  tokenExpiresAt: '2027-01-01T00:00:00.000Z', authenticatedAt: new Date().toISOString(),
}

test('exclusao apaga objeto e cache antes de remover dados e identidade', async () => {
  const events: string[] = []
  const repository = privacyRepository({
    planUserErasure: async () => ({ organizationIds: [actor.organizationId], objectKeys: ['organizations/a/exports/e/file.json'] }),
    eraseUserActiveData: async () => { events.push('database') },
  })
  const identity = { deleteAccount: async () => { events.push('identity') } } as unknown as IdentityService
  const coordinator = new PrivacyCoordinator(repository, identity, {
    deleteObject: async () => { events.push('object') },
  }, {
    purgeUser: async () => { events.push('user-cache') },
    purgeOrganization: async () => { events.push('organization-cache') },
  })
  await coordinator.deleteAccount(actor)
  assert.deepEqual(events, ['object', 'user-cache', 'organization-cache', 'database', 'identity'])
})

test('falha no object storage bloqueia exclusao sem deixar metadado falsamente removido', async () => {
  let erased = false
  const repository = privacyRepository({
    planOrganizationErasure: async () => ({ organizationIds: [actor.organizationId], objectKeys: ['organizations/a/exports/e/file.json'] }),
    eraseOrganizationActiveData: async () => { erased = true },
  })
  const coordinator = new PrivacyCoordinator(repository, {} as IdentityService, {
    deleteObject: async () => { throw new Error('storage_down') },
  })
  await assert.rejects(coordinator.deleteOrganization(actor), /storage_down/)
  assert.equal(erased, false)
})

test('expurgo remove objetos vencidos antes de apagar metadata', async () => {
  const events: string[] = []
  const repository = privacyRepository({
    expiredObjectKeys: async () => ['organizations/a/exports/old/file.json'],
    purgeExpired: async () => { events.push('database'); return { sessions: 1, invitations: 1, exports: 1, supportTickets: 1, incidents: 1, jobs: 1 } },
  })
  const result = await new PrivacyRetentionCoordinator(repository, {
    deleteObject: async () => { events.push('object') },
  }).purgeExpired('2026-07-16T00:00:00.000Z')
  assert.deepEqual(events, ['object', 'database'])
  assert.equal(result.exports, 1)
})

function privacyRepository(overrides: Partial<PrivacyRepository>): PrivacyRepository {
  return {
    exportSubjectData: async () => { throw new Error('not_used') },
    planUserErasure: async () => ({ organizationIds: [], objectKeys: [] }),
    eraseUserActiveData: async () => undefined,
    planOrganizationErasure: async () => ({ organizationIds: [], objectKeys: [] }),
    eraseOrganizationActiveData: async () => undefined,
    expiredObjectKeys: async () => [],
    purgeExpired: async () => ({ sessions: 0, invitations: 0, exports: 0, supportTickets: 0, incidents: 0, jobs: 0 }),
    ...overrides,
  }
}
