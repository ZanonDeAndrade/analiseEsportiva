import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { syncData } from '../syncData.js'
import { numberArg, parseArgs } from './args.js'

const args = parseArgs(process.argv.slice(2))
const includeFootballData = args['skip-football-data'] !== true
const includeApiHistory = args['skip-api-history'] !== true
const apiHistoryYears = numberArg(
  args,
  'api-history-years',
  Number(process.env.BETINTEL_API_HISTORY_YEARS ?? 5),
)
const connection = createDatabaseConnection()
const repositories = createPostgresRepositories(connection)
const report = await syncData(repositories, {
  includeFootballData,
  includeApiHistory,
  apiHistoryYears,
}).finally(() => connection.close())

console.log(`Sync concluido no ${report.storage}`)
console.log(`Fixtures: ${report.fixtures}`)
console.log(`Linhas historicas: ${report.resultRows}`)
console.log(`Aceitas: ${report.acceptedRows}; rejeitadas: ${report.rejectedRows}; duplicadas: ${report.duplicateRows}`)
console.log(`Fonte: ${report.sourceProvider}`)
for (const issue of report.importIssues) {
  console.log(`Rejeitada ${issue.source}:${issue.row} [${issue.code}]: ${issue.message}`)
}
for (const warning of report.warnings) console.log(`Aviso: ${warning}`)
