import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { collectFoldPredictions } from '../models/foldScoring.js'
import { majorityClassBaselineModel, uniformBaselineModel } from '../models/baselines.js'
import { candidateModels } from '../models/registry.js'
import { skillComparison } from '../models/skillScore.js'
import type { PredictiveModel } from '../models/types.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds } from '../temporalValidation.js'
import { numberArg, parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

// Baselines obrigatórios da ETAPA 12 (nomes = metadata().name).
const BASELINE_NAMES: Record<string, string> = {
  'baseline-global': 'frequência global',
  'baseline-competition': 'frequência por competição',
  'baseline-classe-comum': 'classe mais comum',
  'frequency-profile-atual': 'modelo atual',
  poisson: 'Poisson simples',
  'baseline-uniforme': 'uniforme',
}

function multiclassBrier(probs: { home_win: number; draw: number; away_win: number } | undefined, outcome: string): number | null {
  if (!probs) return null
  const oh = outcome === 'H' ? 1 : 0
  const od = outcome === 'D' ? 1 : 0
  const oa = outcome === 'A' ? 1 : 0
  return (probs.home_win - oh) ** 2 + (probs.draw - od) ** 2 + (probs.away_win - oa) ** 2
}

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/baselines.json')
  const repetitions = numberArg(args, 'repetitions', 500)
  const seed = numberArg(args, 'seed', Number(process.env.MLOPS_SEED ?? 2026))

  const { rows, issues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const records = assessDataQuality(rows, issues).records
  const exampleByIndex = new Map(generateSequentialFeatures(records).map((example) => [example.index, example]))
  const plan = walkForwardFolds(temporalThreeWaySplit(records).development)

  // Treina candidatos + baselines uma vez, preservando a ordem cronológica dos folds.
  const models: PredictiveModel[] = [...candidateModels, uniformBaselineModel, majorityClassBaselineModel]
  const unique = [...new Map(models.map((model) => [model.metadata().name, model])).values()]
  const collected = collectFoldPredictions(plan, exampleByIndex, unique)

  // Brier multiclasse de 1X2 por partida, por modelo (ordem cronológica preservada).
  const brierByModel = new Map<string, number[]>()
  for (const model of unique) brierByModel.set(model.metadata().name, [])
  for (const item of collected) {
    item.perModel.forEach((prediction, index) => {
      const name = unique[index].metadata().name
      const brier = multiclassBrier(prediction['1X2'] as { home_win: number; draw: number; away_win: number } | undefined, item.example.label.outcome)
      if (brier !== null) brierByModel.get(name)!.push(brier)
    })
  }

  const baselineNames = Object.keys(BASELINE_NAMES)
  const report = candidateModels.map((model) => {
    const name = model.metadata().name
    const modelBrier = brierByModel.get(name) ?? []
    const comparisons = baselineNames
      .filter((baseline) => baseline !== name) // não comparar um modelo consigo mesmo
      .map((baseline) => skillComparison(BASELINE_NAMES[baseline], modelBrier, brierByModel.get(baseline) ?? [], { repetitions, seed }))
    return { model: name, family: model.metadata().family, comparisons }
  })

  console.log('=== ETAPA 12 — skill score vs baselines (1X2 Brier multiclasse) ===')
  console.log('skill = 1 - modelBrier/baselineBrier · positivo supera · zero equivalente · negativo pior. Resultados negativos NÃO são omitidos.')
  for (const entry of report) {
    console.log(`\n${entry.model} [${entry.family}]:`)
    for (const comparison of entry.comparisons) {
      const interval = comparison.skillInterval
      console.log(
        `  vs ${comparison.baseline}: skill=${comparison.skillScore} [${interval.lower}, ${interval.upper}] ` +
          `(${comparison.verdict}), Δabs=${comparison.absoluteDifference}, Δrel=${comparison.relativeDifference}, n=${comparison.sampleSize}`,
      )
    }
  }
  console.log(`\nIntervalos por moving block bootstrap (${repetitions} repetições, seed ${seed}). Teste final reservado.`)

  await writeResult(outputPath, { generatedAt: new Date().toISOString(), repetitions, seed, models: report })
  console.log(`\nRelatório salvo em ${resolve(outputPath)}`)
})
