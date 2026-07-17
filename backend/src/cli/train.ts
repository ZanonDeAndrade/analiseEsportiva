import { resolve } from 'node:path'
import { readCsvFile } from '../csv.js'
import { buildFeatureTable } from '../featureEngineering.js'
import { createDatabaseConnection } from '../infrastructure/database/client.js'
import { createPostgresRepositories } from '../infrastructure/database/repositories.js'
import { trainModel } from '../training.js'
import { parseArgs, numberArg, stringArg } from './args.js'
import { normalizeRecordDates, requireDatabaseUrl, runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = stringArg(args, 'csv')
  const outputPath = stringArg(args, 'output')
  const minRows = numberArg(args, 'min-rows', 5)

  if (csvPath) {
    // Modo academico/offline: treina em memoria a partir do CSV, sem PostgreSQL.
    const rows = await readCsvFile(resolve(csvPath))
    const featureTable = buildFeatureTable(rows)
    const model = trainModel(normalizeRecordDates(featureTable.records), { minRows })
    const available = Object.values(model.markets).filter((market) => market.status === 'available')

    console.log('Modo offline (CSV): modelo treinado em memoria, sem PostgreSQL.')
    console.log(`Linhas aceitas: ${featureTable.records.length}`)
    console.log(`Linhas rejeitadas: ${featureTable.rejectedRows.length}`)
    console.log(`Mercados disponiveis: ${available.length}/${Object.values(model.markets).length}`)
    await writeResult(outputPath, model)
    return
  }

  // Modo PostgreSQL: le o dataset persistido e grava o modelo versionado.
  requireDatabaseUrl()
  const connection = createDatabaseConnection()
  try {
    const repositories = createPostgresRepositories(connection)
    const rows = await repositories.sports.readTrainingRows()
    const featureTable = buildFeatureTable(rows)
    const model = trainModel(featureTable.records, { minRows })
    const persisted = await repositories.models.saveModel(model)

    console.log(`Modelo persistido no PostgreSQL: versao ${persisted.version} (${persisted.id})`)
    console.log(`Linhas aceitas: ${featureTable.records.length}`)
    console.log(`Linhas rejeitadas: ${featureTable.rejectedRows.length}`)
  } finally {
    await connection.close()
  }
})
