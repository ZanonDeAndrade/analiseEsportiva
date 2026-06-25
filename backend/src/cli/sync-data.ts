import { loadLocalEnv } from '../config.js'
import { syncData } from '../syncData.js'
import { numberArg, parseArgs } from './args.js'

loadLocalEnv()

const args = parseArgs(process.argv.slice(2))
const includeFootballData = args['skip-football-data'] !== true
const includeApiHistory = args['skip-api-history'] !== true
const apiHistoryYears = numberArg(
  args,
  'api-history-years',
  Number(process.env.BETINTEL_API_HISTORY_YEARS ?? 5),
)
const report = await syncData({ includeFootballData, includeApiHistory, apiHistoryYears })

console.log(`Sync concluido em ${report.dataDir}`)
console.log(`Fixtures: ${report.fixtures}`)
console.log(`Linhas historicas: ${report.resultRows}`)
console.log(`Fonte: ${report.sourceProvider}`)
if (report.simulated) console.log('Fallback simulado usado para dados ausentes.')
for (const warning of report.warnings) console.log(`Aviso: ${warning}`)
