import { resolve } from 'node:path'
import { runBacktest } from '../backtesting.js'
import { readCsvFile } from '../csv.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { parseArgs, numberArg, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const csvPath = stringArg(args, 'csv')
const minRows = numberArg(args, 'min-rows', 5)
const initialWindow = numberArg(args, 'initial-window', minRows)
const connection = createDatabaseConnection()

try {
  const repositories = createPostgresRepositories(connection)
  const rows = csvPath ? await readCsvFile(resolve(csvPath)) : await repositories.sports.readTrainingRows()
  const featureTable = buildFeatureTable(rows)
  const report = runBacktest(featureTable.records, { minRows, initialWindow })
  await repositories.models.saveEvaluation('backtest', report)
  console.log(`Backtest persistido no PostgreSQL em ${report.generatedAt}`)
} finally {
  await connection.close()
}
