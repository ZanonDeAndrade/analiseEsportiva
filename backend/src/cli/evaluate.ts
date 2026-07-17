import { resolve } from 'node:path'
import { readCsvFile } from '../csv.js'
import { evaluateModel } from '../evaluation.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { assessPromotion, computePerformanceDrift } from '../mlops.js'
import { parseArgs, numberArg, stringArg } from './args.js'
import { normalizeRecordDates, requireDatabaseUrl, runCli, writeResult } from './pipelineRunner.js'

function printMetrics(report: {
  trainRows: number
  validationRows: number
  testRows: number
  split: {
    strategy: string
    discardedRows: number
    train: { from: string; to: string }
    test: { from: string; to: string }
    competitions: Array<{ competition: string; train: number; test: number; total: number }>
  }
  metrics: Array<{ market: string; evaluatedRows: number; brierScore: number; selectionAccuracy: number }>
}) {
  console.log(`Split: ${report.split.strategy}; linhas descartadas (data invalida): ${report.split.discardedRows}`)
  console.log(`Amostras treino/validacao/teste: ${report.trainRows}/${report.validationRows}/${report.testRows}`)
  console.log(`Intervalo treino: ${report.split.train.from || 'n/d'} a ${report.split.train.to || 'n/d'}`)
  console.log(`Intervalo teste:  ${report.split.test.from || 'n/d'} a ${report.split.test.to || 'n/d'}`)
  for (const competition of report.split.competitions) {
    console.log(`  competicao ${competition.competition}: treino=${competition.train}, teste=${competition.test}, total=${competition.total}`)
  }
  for (const metric of report.metrics) {
    console.log(`${metric.market}: n=${metric.evaluatedRows}, Brier=${metric.brierScore}, acuracia=${metric.selectionAccuracy}`)
  }
}

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = stringArg(args, 'csv')
  const outputPath = stringArg(args, 'output')
  const minRows = numberArg(args, 'min-rows', 5)
  const testRatio = numberArg(args, 'test-ratio', 0.2)
  const validationRatio = numberArg(args, 'validation-ratio', 0)
  const seed = numberArg(args, 'seed', Number(process.env.MLOPS_SEED ?? 2026))

  if (csvPath) {
    // Modo academico/offline: avaliacao temporal calculada a partir do CSV.
    const rows = await readCsvFile(resolve(csvPath))
    const featureTable = buildFeatureTable(rows)
    const records = normalizeRecordDates(featureTable.records)
    const report = evaluateModel(records, { minRows, validationRatio, testRatio, seed })

    console.log('Modo offline (CSV): avaliacao temporal calculada sem PostgreSQL.')
    printMetrics(report)
    await writeResult(outputPath, report)
    return
  }

  // Modo PostgreSQL: avalia o challenger persistido e registra a decisao de promocao.
  requireDatabaseUrl()
  const requestedModelId = stringArg(args, 'model-id')
  const connection = createDatabaseConnection()
  try {
    const repositories = createPostgresRepositories(connection)
    const versions = await repositories.models.listModelVersions()
    const candidate = requestedModelId
      ? versions.find((version) => version.id === requestedModelId)
      : versions.find((version) => version.status === 'challenger')
    if (!candidate) {
      throw new Error(requestedModelId
        ? `Model version nao encontrada: ${requestedModelId}`
        : 'Nenhum modelo challenger aguarda avaliacao. Execute npm run backend:train primeiro.')
    }
    const rows = await repositories.sports.readTrainingRows(candidate.datasetVersionId)
    const featureTable = buildFeatureTable(rows)
    const report = evaluateModel(featureTable.records, {
      minRows,
      validationRatio,
      testRatio,
      seed,
      datasetVersionId: candidate.datasetVersionId,
      modelVersionId: candidate.id,
      codeVersion: process.env.APP_RELEASE?.trim() ?? 'development',
    })
    const champion = await repositories.models.getChampionEvaluation()
    const championMetrics = champion && champion.trace.datasetVersionId === report.trace.datasetVersionId
      ? champion.metrics
      : undefined
    report.performanceDrift = computePerformanceDrift(report.metrics, championMetrics)
    report.promotion = assessPromotion(report.metrics, championMetrics)
    if (report.drift.status === 'critical' && report.promotion.decision === 'promote') {
      report.promotion = {
        ...report.promotion,
        decision: 'hold',
        reasons: [...report.promotion.reasons, 'Drift de dados critico bloqueia promocao automatica.'],
      }
    }
    await repositories.models.saveEvaluation('evaluation', report, undefined, candidate.id)
    await repositories.models.applyPromotionDecision(candidate.id, report.promotion)
    console.log(`Avaliacao temporal persistida no PostgreSQL em ${report.generatedAt}`)
    console.log(`Modelo ${candidate.id}: ${report.promotion.decision}`)
    printMetrics(report)
  } finally {
    await connection.close()
  }
})
