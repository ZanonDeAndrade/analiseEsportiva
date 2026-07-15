import { resolve } from 'node:path'
import { importLocalState } from '../import/localStateImporter.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { parseArgs, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const dryRun = args['dry-run'] === true
const allowDemoData = args['allow-demo-data'] === true
const dataDirectory = resolve(stringArg(args, 'data-dir', 'backend/data'))
const artifactsDirectory = resolve(stringArg(args, 'artifacts-dir', 'backend/artifacts'))
const connection = createDatabaseConnection()

try {
  const repositories = createPostgresRepositories(connection)
  const report = await importLocalState(repositories, {
    dryRun,
    allowDemoData,
    dataDirectory,
    artifactsDirectory,
  })

  console.log(JSON.stringify(report, null, 2))
  if (report.rejected > 0 || report.ambiguous > 0) process.exitCode = 2
} finally {
  await connection.close()
}
