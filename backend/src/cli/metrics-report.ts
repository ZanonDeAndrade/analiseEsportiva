import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { compareCalibration, fitIsotonic, fitPlatt, fitTemperature } from '../models/calibration.js'
import { collectFoldPredictions } from '../models/foldScoring.js'
import { binaryMetrics, coverageReport, multiclassMetrics, SCORE_INTERPRETATION } from '../models/metrics.js'
import { frequencyProfileModel } from '../models/baselines.js'
import { dixonColesModel } from '../models/poisson.js'
import { logisticModel } from '../models/logistic.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds } from '../temporalValidation.js'
import { parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

const MODELS = { 'dixon-coles': dixonColesModel, logistica: logisticModel, frequency: frequencyProfileModel }

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/metrics.json')
  const modelName = stringArg(args, 'model', 'dixon-coles') as keyof typeof MODELS
  const model = MODELS[modelName] ?? dixonColesModel

  const { rows, issues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const records = assessDataQuality(rows, issues).records
  const examples = generateSequentialFeatures(records)
  const exampleByIndex = new Map(examples.map((example) => [example.index, example]))
  const plan = walkForwardFolds(temporalThreeWaySplit(records).development)
  const collected = collectFoldPredictions(plan, exampleByIndex, [model])

  // ETAPA 11.1 — métricas multiclasse para 1X2 (nunca binário independente com limiar 0,5).
  const outcomeClass = (outcome: string) => (outcome === 'H' ? 0 : outcome === 'D' ? 1 : 2)
  const x2Probs: number[][] = []
  const x2Actual: number[] = []
  let predicted1x2 = 0
  for (const item of collected) {
    const x2 = item.perModel[0]['1X2']
    if (!x2) continue
    predicted1x2 += 1
    x2Probs.push([x2.home_win, x2.draw, x2.away_win])
    x2Actual.push(outcomeClass(item.example.label.outcome))
  }
  const multiclass = multiclassMetrics(x2Probs, x2Actual)

  // ETAPA 11.2 — mercado binário (Over 2.5).
  const overProbs: number[] = []
  const overLabels: number[] = []
  for (const item of collected) {
    const over = item.perModel[0].OVER_2_5_GOALS
    if (!over) continue
    overProbs.push(over.over_2_5)
    overLabels.push(item.example.label.totalGoals > 2.5 ? 1 : 0)
  }
  const binary = binaryMetrics(overProbs, overLabels)

  // ETAPA 11.4 — cobertura sempre junto da acurácia.
  const coverage = coverageReport(collected.length, predicted1x2, collected.length - predicted1x2)

  // ETAPA 10 — calibração (Over 2.5): ajusta nos folds antigos, mede no fold recente.
  const folds = [...new Set(collected.map((item) => item.foldIndex))].sort((a, b) => a - b)
  const evalFold = folds.at(-1)!
  const fitMask = collected.map((item) => item.foldIndex !== evalFold)
  const fitProbs = overProbs.filter((_, i) => fitMask[i])
  const fitLabels = overLabels.filter((_, i) => fitMask[i])
  const evalProbs = overProbs.filter((_, i) => !fitMask[i])
  const evalLabels = overLabels.filter((_, i) => !fitMask[i])
  const calibrations = [
    compareCalibration('platt', fitPlatt, fitProbs, fitLabels, evalProbs, evalLabels),
    compareCalibration('isotonic', fitIsotonic, fitProbs, fitLabels, evalProbs, evalLabels),
    compareCalibration('temperature', fitTemperature, fitProbs, fitLabels, evalProbs, evalLabels),
  ]

  console.log(`=== ETAPA 11 — métricas (${modelName}) ===`)
  console.log(SCORE_INTERPRETATION)
  console.log(`\n1X2 (multiclasse): acurácia argmax=${multiclass.argmaxAccuracy}, Brier=${multiclass.multiclassBrier}, logLoss=${multiclass.multiclassLogLoss}, macroF1=${multiclass.macroF1}, balancedAcc=${multiclass.balancedAccuracy}`)
  console.log(`  baseline classe majoritária: acc=${multiclass.majorityBaseline.accuracy}, Brier=${multiclass.majorityBaseline.multiclassBrier}; baseline frequência: Brier=${multiclass.frequencyBaseline.multiclassBrier}`)
  console.log(`  matriz de confusão (linha=real, coluna=previsto): ${JSON.stringify(multiclass.confusionMatrix)}`)
  console.log(`Over 2.5 (binário): Brier=${binary.brierScore}, logLoss=${binary.logLoss}, balancedAcc=${binary.balancedAccuracy}, precisão=${binary.precision}, recall=${binary.recall}, F1=${binary.f1}, prevalência=${binary.prevalence}`)
  console.log(`Cobertura: ${coverage.predicted}/${coverage.totalMatches} previstas (${coverage.coveragePct}%), ${coverage.insufficientData} dados_insuficientes`)

  console.log('\n=== ETAPA 10 — calibração (Over 2.5; ajuste só na validação) ===')
  for (const calibration of calibrations) {
    console.log(`  ${calibration.method}: ECE ${calibration.before.expectedCalibrationError} -> ${calibration.after.expectedCalibrationError}, MCE ${calibration.before.maximumCalibrationError} -> ${calibration.after.maximumCalibrationError}, Brier ${calibration.before.brierScore} -> ${calibration.after.brierScore} | aceita=${calibration.accepted}`)
  }
  console.log('Teste final permanece reservado; calibração nunca é ajustada nele.')

  await writeResult(outputPath, {
    generatedAt: new Date().toISOString(),
    model: modelName,
    interpretation: SCORE_INTERPRETATION,
    multiclass1x2: multiclass,
    binaryOver25: binary,
    coverage,
    calibration: calibrations,
  })
  console.log(`\nRelatório salvo em ${resolve(outputPath)}`)
})
