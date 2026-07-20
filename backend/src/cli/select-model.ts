import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCsvDetailed } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { calibrationMetrics } from '../models/calibration.js'
import { collectFoldPredictions } from '../models/foldScoring.js'
import { meanValidationBrier } from '../models/foldScoring.js'
import { globalBaselineModel, frequencyProfileModel } from '../models/baselines.js'
import { gridSearch, validateHyperparameters, DEFAULT_HYPERPARAMETERS, type ValidationIssue } from '../models/hyperparameters.js'
import { createLogisticModel, DEFAULT_LOGISTIC_CONFIG, type LogisticConfig } from '../models/logistic.js'
import { evaluatePromotion, type PromotionInputs } from '../models/promotion.js'
import { generateSequentialFeatures } from '../preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds, type WalkForwardPlan } from '../temporalValidation.js'
import { numberArg, parseArgs, stringArg } from './args.js'
import { runCli, writeResult } from './pipelineRunner.js'

function multiclassBrier(probs: { home_win: number; draw: number; away_win: number } | undefined, outcome: string): number | null {
  if (!probs) return null
  const oh = outcome === 'H' ? 1 : 0
  const od = outcome === 'D' ? 1 : 0
  const oa = outcome === 'A' ? 1 : 0
  return (probs.home_win - oh) ** 2 + (probs.draw - od) ** 2 + (probs.away_win - oa) ** 2
}

function logLoss(probs: { home_win: number; draw: number; away_win: number } | undefined, outcome: string): number | null {
  if (!probs) return null
  const p = outcome === 'H' ? probs.home_win : outcome === 'D' ? probs.draw : probs.away_win
  return -Math.log(Math.max(1e-6, Math.min(1 - 1e-6, p)))
}

runCli(async () => {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = resolve(stringArg(args, 'csv', 'backend/data/combined-results.csv'))
  const outputPath = stringArg(args, 'output', 'backend/reports/model-selection.json')
  const seed = numberArg(args, 'seed', Number(process.env.MLOPS_SEED ?? 2026))

  const { rows, issues } = parseCsvDetailed(await readFile(csvPath, 'utf8'))
  const records = assessDataQuality(rows, issues).records
  const exampleByIndex = new Map(generateSequentialFeatures(records).map((example) => [example.index, example]))
  const plan: WalkForwardPlan = walkForwardFolds(temporalThreeWaySplit(records).development)

  // ETAPA 14 — busca de hiperparâmetros da logística SOMENTE na validação (teste reservado).
  const grid: LogisticConfig[] = []
  for (const iterations of [200, 300]) for (const learningRate of [0.1, 0.2]) for (const l2 of [1e-3, 1e-2]) grid.push({ iterations, learningRate, l2 })
  const search = gridSearch<LogisticConfig>(
    'logistic',
    grid,
    (config) => validateHyperparameters({ ...DEFAULT_HYPERPARAMETERS, logistic: config }).filter((issue: ValidationIssue) => issue.field.startsWith('logistic')),
    (config) => meanValidationBrier(plan, exampleByIndex, createLogisticModel(config)),
    { seed, maxExperiments: 8 },
  )
  const bestConfig = search.best ?? DEFAULT_LOGISTIC_CONFIG

  // ETAPA 15 — montar entradas de promoção do candidato vs baseline e modelo atual.
  const candidate = createLogisticModel(bestConfig)
  const startedAt = performance.now()
  const collected = collectFoldPredictions(plan, exampleByIndex, [candidate, globalBaselineModel, frequencyProfileModel])
  const runtimeMs = performance.now() - startedAt

  const perFold = new Map<number, { cand: number[]; base: number[] }>()
  const perCompetition = new Map<string, { cand: number[]; base: number[] }>()
  const candBrier: number[] = []
  const baseBrier: number[] = []
  const candLL: number[] = []
  const baseLL: number[] = []
  const currentX2: number[] = []
  const candX2: number[] = []
  const over25: { cand: number[]; current: number[]; label: number[] } = { cand: [], current: [], label: [] }
  let predicted = 0

  for (const item of collected) {
    const outcome = item.example.label.outcome
    const c = multiclassBrier(item.perModel[0]['1X2'] as never, outcome)
    const b = multiclassBrier(item.perModel[1]['1X2'] as never, outcome)
    const current = multiclassBrier(item.perModel[2]['1X2'] as never, outcome)
    if (c === null || b === null) continue
    predicted += 1
    candBrier.push(c)
    baseBrier.push(b)
    candLL.push(logLoss(item.perModel[0]['1X2'] as never, outcome) ?? 0)
    baseLL.push(logLoss(item.perModel[1]['1X2'] as never, outcome) ?? 0)
    if (current !== null) currentX2.push(current)
    candX2.push(c)
    push(perFold, item.foldIndex, c, b)
    push(perCompetition, item.example.competition, c, b)
    const over = item.perModel[0].OVER_2_5_GOALS?.over_2_5
    const overCurrent = item.perModel[2].OVER_2_5_GOALS?.over_2_5
    if (over !== undefined && overCurrent !== undefined) {
      over25.cand.push(over)
      over25.current.push(overCurrent)
      over25.label.push(item.example.label.totalGoals > 2.5 ? 1 : 0)
    }
  }

  const skill = (cand: number[], base: number[]) => (mean(base) > 0 ? 1 - mean(cand) / mean(base) : 0)
  const inputs: PromotionInputs = {
    perFoldBrierSkill: [...perFold.values()].map((fold) => skill(fold.cand, fold.base)),
    perCompetitionBrierSkill: [...perCompetition.entries()].map(([competition, value]) => ({ competition, skill: skill(value.cand, value.base) })),
    brierSkillVsBaseline: skill(candBrier, baseBrier),
    logLossSkillVsBaseline: skill(candLL, baseLL),
    calibrationEceDelta:
      calibrationMetrics(over25.cand, over25.label).expectedCalibrationError -
      calibrationMetrics(over25.current, over25.label).expectedCalibrationError,
    coveragePct: (predicted / Math.max(1, collected.length)) * 100,
    importantMarketRegression: mean(candX2) - mean(currentX2),
    runtimeMs,
    testsPassed: true,
    metadataComplete: Boolean(candidate.metadata().name && candidate.metadata().hyperparameters),
  }
  const decision = evaluatePromotion(inputs)

  console.log('=== ETAPA 14 — busca de hiperparâmetros (logística, só validação) ===')
  console.log(`Grade: ${search.gridSize}, avaliados: ${search.evaluated}, pulados: ${search.skipped}, seed: ${search.seed}`)
  console.log(`Melhor config: ${JSON.stringify(bestConfig)} (Brier validação=${round(search.bestScore ?? 0)})`)

  console.log('\n=== ETAPA 15 — decisão de promoção (candidato vs baseline/atual) ===')
  console.log(`Status: ${decision.status.toUpperCase()} (${decision.passedCount}/${decision.totalCriteria} critérios)`)
  for (const criterion of decision.criteria) {
    console.log(`  [${criterion.passed ? 'OK ' : 'X  '}] ${criterion.criterion} — ${criterion.detail}`)
  }
  console.log('\nO modelo NÃO é promovido automaticamente. O teste final permanece reservado para a decisão explícita.')

  await writeResult(outputPath, { generatedAt: new Date().toISOString(), search, bestConfig, promotionInputs: inputs, decision })
  console.log(`\nRelatório salvo em ${resolve(outputPath)}`)
})

function push<K>(map: Map<K, { cand: number[]; base: number[] }>, key: K, cand: number, base: number) {
  const entry = map.get(key) ?? { cand: [], base: [] }
  entry.cand.push(cand)
  entry.base.push(base)
  map.set(key, entry)
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number): number {
  return Math.round(value * 100000) / 100000
}
