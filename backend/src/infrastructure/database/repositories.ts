import type { DatabaseConnection } from './client.js'
import type { PersistenceRepositories } from '../../application/ports/persistence.js'
import { PostgresModelRepository } from './modelRepository.js'
import { PostgresSportsRepository } from './sportsRepository.js'
import { PostgresSystemStateRepository } from './systemStateRepository.js'
import { PostgresIdentityRepository } from './identityRepository.js'
import { PostgresOrganizationRepository } from './organizationRepository.js'
import { PostgresJobQueue } from './jobQueue.js'
import { PostgresLegalRepository } from './legalRepository.js'
import { PostgresWorkspaceRepository } from './workspaceRepository.js'
import { PostgresOperationsRepository } from './operationsRepository.js'
import { PostgresPrivacyRepository } from './privacyRepository.js'
import { AesGcmFieldCipher } from '../../application/fieldEncryption.js'
import { piiFieldEncryptionConfig } from '../../config.js'

export function createPostgresRepositories(
  connection: DatabaseConnection,
): PersistenceRepositories {
  const encryption = piiFieldEncryptionConfig()
  const cipher = new AesGcmFieldCipher(encryption.keyBase64, encryption.keyVersion)
  return {
    sports: new PostgresSportsRepository(connection.db),
    models: new PostgresModelRepository(connection.db),
    systemState: new PostgresSystemStateRepository(connection.db),
    identity: new PostgresIdentityRepository(connection.db),
    organizations: new PostgresOrganizationRepository(connection.db),
    jobs: new PostgresJobQueue(connection.db),
    legal: new PostgresLegalRepository(connection.db),
    workspace: new PostgresWorkspaceRepository(connection.db),
    operations: new PostgresOperationsRepository(connection.db, cipher),
    privacy: new PostgresPrivacyRepository(connection.db, cipher),
  }
}
