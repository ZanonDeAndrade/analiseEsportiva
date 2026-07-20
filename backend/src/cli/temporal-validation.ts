import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { evaluatePredictions } from '../evaluation.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { summarizeWalkForward, temporalThreeWaySplit, walkForwardFolds } from '../temporalValidation.js'
import { trainModel } from '../training.js'
import { numberArg, parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/temporal-validation.json')
  const minRows = numberArg(args, 'min-rows', 5)
  const seed = numberArg(args, 'seed', Number(process.env.MLOPS_SEED ?? 2026))

  const { rows, issues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const records = assessDataQuality(rows, issues).records

  // ETAPA 3 — features pré-jogo sem vazamento temporal.
  const features = generateSequentialFeatures(records)
  const firstWithHistory = features.find((example) => example.features.homeHasHistory && example.features.awayHasHistory)

  // ETAPA 4 — split três-vias (teste reservado) e walk-forward no development.
  const split = temporalThreeWaySplit(records)
  const plan = walkForwardFolds(split.development)

  // Walk-forward do baseline atual (apenas development; teste NUNCA é usado aqui).
  const foldMetrics = plan.folds.map((fold) => {
    const model = trainModel(fold.train, { minRows, seed })
    const metrics = evaluatePredictions(model, fold.validation, fold.train, seed)
    const meanBrier = metrics.length ? metrics.reduce((sum, metric) => sum + metric.brierScore, 0) / metrics.length : null
    return {
      competition: fold.competition,
      fold: fold.fold,
      validationPeriod: fold.validationPeriod,
      trainRows: fold.train.length,
      validationRows: fold.validation.length,
      meanBrier: meanBrier === null ? null : round(meanBrier),
    }
  })

  console.log('=== ETAPA 3 — features pré-jogo sem vazamento ===')
  console.log(`Exemplos gerados: ${features.length}`)
  if (firstWithHistory) {
    console.log(`Amostra (${firstWithHistory.homeTeam} x ${firstWithHistory.awayTeam}, ${firstWithHistory.date}):`)
    console.log(`  ${JSON.stringify(firstWithHistory.features)}`)
  }

  console.log('\n=== ETAPA 4 — split temporal (treino / validação / teste) ===')
  console.log(`Descartadas (data inválida): ${split.report.discardedRows}`)
  console.log(`Treino:    ${split.report.train.from}..${split.report.train.to} (${split.report.train.rows})`)
  console.log(`Validação: ${split.report.validation.from}..${split.report.validation.to} (${split.report.validation.rows})`)
  console.log(`Teste:     ${split.report.test.from}..${split.report.test.to} (${split.report.test.rows}) [held-out]`)
  for (const competition of split.report.competitions) {
    console.log(`  ${competition.competition}: ${competition.strategy}, ${competition.seasons} temporada(s), treino/val/teste = ${competition.train.rows}/${competition.validation.rows}/${competition.test.rows}${competition.lowHistory ? ' [pouco histórico]' : ''}`)
  }

  console.log('\n=== Walk-forward (development; teste reservado) ===')
  console.log(`Estratégia: ${plan.strategy}`)
  for (const competition of plan.competitions) {
    console.log(`  ${competition.competition}: ${competition.folds} fold(s)${competition.note ? ` — ${competition.note}` : ''}`)
  }
  console.log('Brier médio do baseline por fold (validação):')
  for (const metric of foldMetrics) {
    console.log(`  ${metric.competition} fold ${metric.fold} (valida ${metric.validationPeriod}): Brier=${metric.meanBrier} treino=${metric.trainRows} val=${metric.validationRows}`)
  }

  await writeResult(outputPath, {
    generatedAt: new Date().toISOString(),
    features: { count: features.length, sample: firstWithHistory ?? null },
    split: split.report,
    walkForward: summarizeWalkForward(plan),
    baselineWalkForward: foldMetrics,
    note: 'O conjunto de teste é reservado (held-out) e não é usado para escolher features, hiperparâmetros, modelo, limiar, janela ou calibração.',
  })
  console.log(`\nRelatório salvo em ${resolve(outputPath)}`)
})

function round(value: number) {
  return Math.round(value * 10000) / 10000
}
