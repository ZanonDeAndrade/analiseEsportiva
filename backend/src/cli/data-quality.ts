import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { numberArg, parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/data-quality.json')
  const maxIssues = numberArg(args, 'max-issues', 20)

  const { rows, issues: parseIssues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const report = assessDataQuality(rows, parseIssues)

  console.log('=== Relatório de qualidade de dados ===')
  console.log(`Arquivo: ${csvPath}`)
  console.log(
    `Linhas: ${report.totalRows} totais / ${report.accepted} aceitas / ${report.rejected} rejeitadas / ${report.warnings} avisos / ${report.duplicates} duplicadas`,
  )
  console.log(`Problemas por tipo: ${JSON.stringify(report.problemsByType)}`)
  console.log(`Problemas por fonte: ${JSON.stringify(report.problemsBySource)}`)
  const sample = report.issues.slice(0, maxIssues)
  if (sample.length > 0) {
    console.log(`Amostra de problemas (até ${maxIssues}):`)
    for (const issue of sample) {
      console.log(`  [${issue.severity}] ${issue.code} linha ${issue.row} ${issue.field}="${issue.value}" (${issue.source}): ${issue.reason}`)
    }
  } else {
    console.log('Nenhum problema detectado.')
  }

  await writeResult(outputPath, report)
  console.log(`Relatório completo salvo em ${resolve(outputPath)}`)
})
