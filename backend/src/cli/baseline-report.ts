import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsv } from '../csv.js'
import { BASELINE_LABEL, buildBaselineReport, formatBaselineSummary } from '../baselineReport.js'
import { numberArg, parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/baseline-anterior-correcoes.json')
  const minRows = numberArg(args, 'min-rows', 5)
  const seed = numberArg(args, 'seed', Number(process.env.MLOPS_SEED ?? 2026))
  const testRatio = numberArg(args, 'test-ratio', 0.2)
  const validationRatio = numberArg(args, 'validation-ratio', 0)
  const backtestMaxRows = numberArg(args, 'backtest-max-rows', 600)

  const rawContent = await readFile(csvPath, 'utf8')
  const rows = parseCsv(rawContent)
  const report = buildBaselineReport(rawContent, rows, {
    minRows,
    seed,
    testRatio,
    validationRatio,
    backtestMaxRows,
    datasetVersion: stringArg(args, 'dataset-version'),
  })

  console.log(formatBaselineSummary(report))
  await writeResult(outputPath, report)
  console.log(`\nRelatório "${BASELINE_LABEL}" salvo em ${resolve(outputPath)}`)
})
