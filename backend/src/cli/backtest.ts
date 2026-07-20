import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runBacktest } from '../backtesting.js'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { parseArgs, numberArg, stringArg } from './args.js'
import { requireDatabaseUrl, runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = stringArg(args, 'csv')
  const outputPath = stringArg(args, 'output')
  const minRows = numberArg(args, 'min-rows', 5)
  const initialWindow = numberArg(args, 'initial-window', minRows)
  const seed = numberArg(args, 'seed', Number(process.env.MLOPS_SEED ?? 2026))

  if (csvPath) {
    // Modo academico/offline: valida os dados e roda o backtest, sem PostgreSQL.
    const { rows, issues } = parseCsvDetailed(await readFile(resolve(csvPath), 'utf8'))
    const quality = assessDataQuality(rows, issues)
    const report = runBacktest(quality.records, { minRows, initialWindow, seed })

    console.log('Modo offline (CSV): backtest temporal calculado sem PostgreSQL.')
    console.log(`Qualidade: ${quality.accepted} aceitas / ${quality.rejected} rejeitadas / ${quality.warnings} avisos / ${quality.duplicates} duplicadas`)
    console.log(`Janela inicial: ${report.initialWindow}; amostra avaliada: ${report.evaluatedRows}`)
    console.log(`Periodo: ${report.period.from} a ${report.period.to}`)
    for (const metric of report.metrics) {
      console.log(`${metric.market}: n=${metric.evaluatedRows}, Brier=${metric.brierScore}, acuracia=${metric.selectionAccuracy}`)
    }
    await writeResult(outputPath, report)
    return
  }

  // Modo PostgreSQL: backtest do modelo versionado, persistido para consulta.
  requireDatabaseUrl()
  const requestedModelId = stringArg(args, 'model-id')
  const connection = createDatabaseConnection()
  try {
    const repositories = createPostgresRepositories(connection)
    const versions = await repositories.models.listModelVersions()
    const selected = requestedModelId
      ? versions.find((version) => version.id === requestedModelId)
      : versions.find((version) => version.status === 'ready')
        ?? versions.find((version) => version.status === 'challenger')
    if (!selected) throw new Error('Nenhum modelo versionado disponivel para o backtest.')
    const rows = await repositories.sports.readTrainingRows(selected.datasetVersionId)
    const featureTable = buildFeatureTable(rows)
    const report = runBacktest(featureTable.records, {
      minRows,
      initialWindow,
      seed,
      datasetVersionId: selected.datasetVersionId,
      modelVersionId: selected.id,
      codeVersion: process.env.APP_RELEASE?.trim() ?? 'development',
    })
    await repositories.models.saveEvaluation('backtest', report, undefined, selected.id)
    console.log(`Backtest persistido no PostgreSQL em ${report.generatedAt}`)
    console.log(`Modelo ${selected.id}; amostra avaliada: ${report.evaluatedRows}`)
  } finally {
    await connection.close()
  }
})
