import { resolve } from 'node:path'
import { readCsvFile } from '../csv.js'
import { evaluateModel } from '../evaluation.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { parseArgs, numberArg, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const csvPath = stringArg(args, 'csv')
const minRows = numberArg(args, 'min-rows', 5)
const testRatio = numberArg(args, 'test-ratio', 0.2)
const connection = createDatabaseConnection()

try {
  const repositories = createPostgresRepositories(connection)
  const rows = csvPath ? await readCsvFile(resolve(csvPath)) : await repositories.sports.readTrainingRows()
  const featureTable = buildFeatureTable(rows)
  const report = evaluateModel(featureTable.records, { minRows, testRatio })
  await repositories.models.saveEvaluation('evaluation', report)
  console.log(`Avaliacao persistida no PostgreSQL em ${report.generatedAt}`)
} finally {
  await connection.close()
}
