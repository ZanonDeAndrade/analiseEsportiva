import { resolve } from 'node:path'
import { readCsvFile } from '../csv.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { trainModel } from '../training.js'
import { parseArgs, numberArg, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const csvPath = stringArg(args, 'csv')
const minRows = numberArg(args, 'min-rows', 5)
const connection = createDatabaseConnection()

try {
  const repositories = createPostgresRepositories(connection)
  const rows = csvPath ? await readCsvFile(resolve(csvPath)) : await repositories.sports.readTrainingRows()
  const featureTable = buildFeatureTable(rows)
  const model = trainModel(featureTable.records, { minRows })
  const persisted = await repositories.models.saveModel(model)

  console.log(`Modelo persistido no PostgreSQL: versao ${persisted.version} (${persisted.id})`)
  console.log(`Linhas aceitas: ${featureTable.records.length}`)
  console.log(`Linhas rejeitadas: ${featureTable.rejectedRows.length}`)
} finally {
  await connection.close()
}
