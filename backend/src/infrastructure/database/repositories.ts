import type { DatabaseConnection } from './client.js'
import type { PersistenceRepositories } from '../../application/ports/persistence.js'
import { PostgresModelRepository } from './modelRepository.js'
import { PostgresSportsRepository } from './sportsRepository.js'
import { PostgresSystemStateRepository } from './systemStateRepository.js'
import { PostgresIdentityRepository } from './identityRepository.js'
import { PostgresOrganizationRepository } from './organizationRepository.js'
import { PostgresJobQueue } from './jobQueue.js'

export function createPostgresRepositories(
  connection: DatabaseConnection,
): PersistenceRepositories {
  return {
    sports: new PostgresSportsRepository(connection.db),
    models: new PostgresModelRepository(connection.db),
    systemState: new PostgresSystemStateRepository(connection.db),
    identity: new PostgresIdentityRepository(connection.db),
    organizations: new PostgresOrganizationRepository(connection.db),
    jobs: new PostgresJobQueue(connection.db),
  }
}
