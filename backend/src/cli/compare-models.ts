import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { compareModels } from '../modelComparison.js'
import { candidateModels } from '../models/registry.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds } from '../temporalValidation.js'
import { parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/model-comparison.json')

  const { rows, issues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const records = assessDataQuality(rows, issues).records

  const examples = generateSequentialFeatures(records)
  const exampleByIndex = new Map(examples.map((example) => [example.index, example]))

  // Teste final reservado: a comparação usa apenas o development (treino + validação).
  const split = temporalThreeWaySplit(records)
  const plan = walkForwardFolds(split.development)
  const report = compareModels(plan, exampleByIndex, candidateModels)

  console.log('=== ETAPA 6 — comparação de modelos (walk-forward, teste reservado) ===')
  console.log(`Folds: ${report.folds} | exemplos de validação: ${report.validationExamples}`)
  console.log('\nRanking por Brier médio (menor é melhor):')
  report.ranking.forEach((entry, position) => {
    console.log(`  ${position + 1}. ${entry.name}: Brier=${entry.meanBrierScore}`)
  })
  console.log('\nDetalhe por modelo:')
  for (const model of report.models) {
    console.log(`  ${model.name} [${model.family}] — Brier=${model.meanBrierScore} logLoss=${model.meanLogLoss} mercados=${model.coveredMarkets}`)
  }
  console.log('\nBrier por mercado (1X2 / Over2.5 / BTTS):')
  for (const model of report.models) {
    const pick = (market: string) => model.markets.find((item) => item.market === market)?.brierScore ?? 'n/d'
    console.log(`  ${model.name}: 1X2=${pick('1X2')} Over2.5=${pick('OVER_2_5_GOALS')} BTTS=${pick('BOTH_TEAMS_SCORE')}`)
  }
  console.log('\nNenhum modelo é promovido automaticamente. O modelo de produção permanece inalterado.')

  await writeResult(outputPath, { generatedAt: new Date().toISOString(), ...report })
  console.log(`\nRelatório salvo em ${resolve(outputPath)}`)
})
