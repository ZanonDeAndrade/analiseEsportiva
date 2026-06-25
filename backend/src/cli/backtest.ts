import { resolve } from 'node:path'
import { artifactPath } from '../config.js'
import { runBacktest } from '../backtesting.js'
import { readTrainingRows } from '../dataStore.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { writeJson } from '../io.js'
import { parseArgs, numberArg, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const csvPath = stringArg(args, 'csv')
const outPath = stringArg(args, 'out', artifactPath('backtest.json'))
const minRows = numberArg(args, 'min-rows', 5)
const initialWindow = numberArg(args, 'initial-window', minRows)

const resolvedOutPath = resolve(outPath)
const featureTable = buildFeatureTable(await readTrainingRows(csvPath))
const report = runBacktest(featureTable.records, { minRows, initialWindow })

await writeJson(resolvedOutPath, report)
console.log(`Backtest salvo em ${resolvedOutPath}`)
