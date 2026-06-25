import { resolve } from 'node:path'
import { artifactPath } from '../config.js'
import { readTrainingRows } from '../dataStore.js'
import { evaluateModel } from '../evaluation.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { writeJson } from '../io.js'
import { parseArgs, numberArg, stringArg } from './args.js'

const args = parseArgs(process.argv.slice(2))
const csvPath = stringArg(args, 'csv')
const outPath = stringArg(args, 'out', artifactPath('evaluation.json'))
const minRows = numberArg(args, 'min-rows', 5)
const testRatio = numberArg(args, 'test-ratio', 0.2)

const resolvedOutPath = resolve(outPath)
const featureTable = buildFeatureTable(await readTrainingRows(csvPath))
const report = evaluateModel(featureTable.records, { minRows, testRatio })

await writeJson(resolvedOutPath, report)
console.log(`Avaliacao salva em ${resolvedOutPath}`)
