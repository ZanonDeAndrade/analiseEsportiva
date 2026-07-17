import { requirePermission } from './authorization.js'
import { IdentityError } from './identityErrors.js'
import { requireFreshAuthentication, type IdentityService } from './identityService.js'
import type { ActorContext } from './ports/identity.js'
import type { PrivateCachePurger, PrivateObjectStorage, PrivacyRepository } from './ports/privacy.js'

export class PrivacyCoordinator {
  constructor(
    private readonly repository: PrivacyRepository,
    private readonly identityService: IdentityService,
    private readonly objectStorage: PrivateObjectStorage = new UnconfiguredPrivateObjectStorage(),
    private readonly cache: PrivateCachePurger = new NoPrivateDataCache(),
  ) {}

  exportSubjectData(actor: ActorContext) {
    requirePermission(actor.role, 'privacy.export')
    return this.repository.exportSubjectData(actor)
  }

  async deleteAccount(actor: ActorContext, replacementOwnerUserId?: string) {
    requirePermission(actor.role, 'privacy.erase')
    requireFreshAuthentication(actor)
    const plan = await this.repository.planUserErasure(actor, replacementOwnerUserId)
    await this.deleteObjects(plan.objectKeys)
    await this.cache.purgeUser(actor.userId)
    for (const organizationId of plan.organizationIds) await this.cache.purgeOrganization(organizationId)
    await this.repository.eraseUserActiveData(actor)
    await this.identityService.deleteAccount(actor, replacementOwnerUserId)
  }

  async deleteOrganization(actor: ActorContext) {
    requirePermission(actor.role, 'organization.delete')
    requireFreshAuthentication(actor)
    const plan = await this.repository.planOrganizationErasure(actor)
    await this.deleteObjects(plan.objectKeys)
    await this.cache.purgeOrganization(actor.organizationId)
    await this.repository.eraseOrganizationActiveData(actor)
  }

  async purgeExpired(now = new Date().toISOString()) {
    const objectKeys = await this.repository.expiredObjectKeys(now)
    await this.deleteObjects(objectKeys)
    return this.repository.purgeExpired(now)
  }

  private async deleteObjects(keys: string[]) {
    for (const key of [...new Set(keys)]) {
      if (!key || key.includes('..')) throw new IdentityError('invalid_state', 'Chave de objeto invalida bloqueou a exclusao.', 503)
      await this.objectStorage.deleteObject(key)
    }
  }
}

export class UnconfiguredPrivateObjectStorage implements PrivateObjectStorage {
  async deleteObject(): Promise<void> {
    throw new IdentityError(
      'object_storage_unavailable',
      'A exclusao foi bloqueada porque existe objeto privado e o adapter de storage nao esta configurado.',
      503,
    )
  }
}

/** The current runtime has no server-side cache containing tenant PII. */
export class NoPrivateDataCache implements PrivateCachePurger {
  async purgeUser(): Promise<void> {}
  async purgeOrganization(): Promise<void> {}
}

export class PrivacyRetentionCoordinator {
  constructor(
    private readonly repository: PrivacyRepository,
    private readonly objectStorage: PrivateObjectStorage = new UnconfiguredPrivateObjectStorage(),
  ) {}

  async purgeExpired(now = new Date().toISOString()) {
    const keys = await this.repository.expiredObjectKeys(now)
    for (const key of [...new Set(keys)]) {
      if (!key || key.includes('..')) throw new IdentityError('invalid_state', 'Chave de objeto invalida bloqueou o expurgo.', 503)
      await this.objectStorage.deleteObject(key)
    }
    return this.repository.purgeExpired(now)
  }
}
