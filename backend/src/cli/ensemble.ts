import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { evaluateEnsemble } from '../models/ensemble.js'
import { createGradientBoostingModel } from '../models/gradientBoosting.js'
import { tuneGradientBoosting } from '../models/hyperparameterSearch.js'
import { dixonColesModel } from '../models/poisson.js'
import { logisticModel } from '../models/logistic.js'
import { frequencyProfileModel } from '../models/baselines.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds } from '../temporalValidation.js'
import { parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/ensemble.json')

  const { rows, issues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const records = assessDataQuality(rows, issues).records
  const examples = generateSequentialFeatures(records)
  const exampleByIndex = new Map(examples.map((example) => [example.index, example]))
  const plan = walkForwardFolds(temporalThreeWaySplit(records).development)

  // ETAPA 8 — busca de hiperparâmetros do GBM SOMENTE na validação temporal.
  console.log('=== ETAPA 8 — busca de hiperparâmetros do gradient boosting (só validação) ===')
  const tuning = tuneGradientBoosting(plan, exampleByIndex)
  for (const entry of [...tuning.log].sort((a, b) => a.meanValidationBrier - b.meanValidationBrier)) {
    console.log(`  depth=${entry.config.maxDepth} lr=${entry.config.learningRate} lambda=${entry.config.lambda} rounds=${entry.config.rounds} -> Brier=${round(entry.meanValidationBrier)}`)
  }
  console.log(`Melhor config: ${JSON.stringify(tuning.best)} (Brier=${round(tuning.bestBrier)})`)

  // ETAPA 9 — ensemble de componentes avaliados isoladamente.
  console.log('\n=== ETAPA 9 — ensemble (pesos aprendidos na validação, teste reservado) ===')
  const components = [dixonColesModel, logisticModel, frequencyProfileModel, createGradientBoostingModel(tuning.best)]
  const ensemble = evaluateEnsemble(plan, exampleByIndex, components)
  console.log(`Componentes: ${ensemble.components.join(', ')}`)
  console.log(`Pesos (somam ${round(ensemble.weights.reduce((sum, weight) => sum + weight, 0))}): ${ensemble.weights.map(round).join(', ')}`)
  console.log(`Aprendido nos folds: ${ensemble.learnedOnFolds.join(', ')} | avaliado no fold: ${ensemble.evaluatedOnFolds.join(', ')}`)
  console.log(`Brier ensemble: ${ensemble.ensembleBrier}`)
  for (const component of ensemble.componentBriers) console.log(`  ${component.name}: ${component.brier}`)
  console.log(ensemble.promoted
    ? 'Ensemble superou TODOS os componentes na validação → candidato à promoção (confirmar no teste reservado).'
    : 'Ensemble NÃO superou todos os componentes → não promover. Modelo de produção inalterado.')

  await writeResult(outputPath, {
    generatedAt: new Date().toISOString(),
    hyperparameterSearch: { best: tuning.best, bestBrier: round(tuning.bestBrier), log: tuning.log.map((entry) => ({ config: entry.config, meanValidationBrier: round(entry.meanValidationBrier) })) },
    ensemble,
  })
  console.log(`\nRelatório salvo em ${resolve(outputPath)}`)
})

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
