import { resolve } from 'node:path'
import { modelPath } from '../config.js'
import { readTrainingRows } from '../dataStore.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { writeJson } from '../io.js'
import { trainModel } from '../training.js'
import { parseArgs, numberArg, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const csvPath = stringArg(args, 'csv')
const outPath = stringArg(args, 'out', modelPath())
const minRows = numberArg(args, 'min-rows', 5)

const resolvedOutPath = resolve(outPath)
const rows = await readTrainingRows(csvPath)
const featureTable = buildFeatureTable(rows)
const model = trainModel(featureTable.records, { minRows })

await writeJson(resolvedOutPath, {
  ...model,
  featureEngineering: {
    detectedColumns: featureTable.detectedColumns,
    acceptedRows: featureTable.records.length,
    rejectedRows: featureTable.rejectedRows,
  },
})

console.log(`Modelo salvo em ${resolvedOutPath}`)
console.log(`Linhas aceitas: ${featureTable.records.length}`)
