/**
 * ETAPA 10 — Avaliação e ajuste de calibração de probabilidades binárias.
 *
 * O ajuste (Platt / Isotônica / Temperatura) é feito SOMENTE no conjunto de
 * validação; o teste final nunca é usado para calibrar. As métricas de
 * calibração (ECE, MCE, reliability, distribuição por faixa) e as métricas de
 * qualidade (Brier, log loss — quanto menor, melhor) são reportadas antes e
 * depois, e uma calibração só é aceita se não piorar a generalização.
 */

export interface ReliabilityBin {
  lower: number
  upper: number
  meanPredicted: number
  observedRate: number
  count: number
}

export interface CalibrationMetrics {
  expectedCalibrationError: number
  maximumCalibrationError: number
  brierScore: number
  logLoss: number
  reliability: ReliabilityBin[]
  predictionDistribution: number[]
}

export type Calibrator = (probability: number) => number

const BINS = 10

export function reliabilityDiagram(probabilities: number[], labels: number[], bins = BINS): ReliabilityBin[] {
  const result: ReliabilityBin[] = []
  for (let index = 0; index < bins; index += 1) {
    const lower = index / bins
    const upper = (index + 1) / bins
    const inBin: Array<{ p: number; y: number }> = []
    for (let i = 0; i < probabilities.length; i += 1) {
      const p = probabilities[i]
      const belongs = index === bins - 1 ? p >= lower && p <= upper : p >= lower && p < upper
      if (belongs) inBin.push({ p, y: labels[i] })
    }
    if (inBin.length === 0) continue
    result.push({
      lower,
      upper,
      meanPredicted: round(mean(inBin.map((item) => item.p))),
      observedRate: round(mean(inBin.map((item) => item.y))),
      count: inBin.length,
    })
  }
  return result
}

export function calibrationMetrics(probabilities: number[], labels: number[], bins = BINS): CalibrationMetrics {
  const reliability = reliabilityDiagram(probabilities, labels, bins)
  const total = probabilities.length || 1
  const ece = reliability.reduce((sum, bin) => sum + (bin.count / total) * Math.abs(bin.meanPredicted - bin.observedRate), 0)
  const mce = reliability.reduce((max, bin) => Math.max(max, Math.abs(bin.meanPredicted - bin.observedRate)), 0)
  const distribution = new Array(bins).fill(0)
  for (const p of probabilities) distribution[Math.min(bins - 1, Math.floor(p * bins))] += 1
  return {
    expectedCalibrationError: round(ece),
    maximumCalibrationError: round(mce),
    brierScore: round(mean(probabilities.map((p, i) => (p - labels[i]) ** 2))),
    logLoss: round(mean(probabilities.map((p, i) => binaryLogLoss(p, labels[i])))),
    reliability,
    predictionDistribution: distribution,
  }
}

/** Platt scaling: logística sobre o logit da probabilidade (ajuste na validação). */
export function fitPlatt(probabilities: number[], labels: number[], iterations = 400, learningRate = 0.1): Calibrator {
  let a = 1
  let b = 0
  const z = probabilities.map(logit)
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let gradA = 0
    let gradB = 0
    for (let i = 0; i < z.length; i += 1) {
      const error = sigmoid(a * z[i] + b) - labels[i]
      gradA += error * z[i]
      gradB += error
    }
    const size = Math.max(1, z.length)
    a -= learningRate * (gradA / size)
    b -= learningRate * (gradB / size)
  }
  return (probability) => clamp(sigmoid(a * logit(probability) + b))
}

/** Regressão isotônica (pool-adjacent-violators): calibrador monotônico não-decrescente. */
export function fitIsotonic(probabilities: number[], labels: number[]): Calibrator {
  const sorted = probabilities.map((p, i) => ({ p, y: labels[i] })).sort((left, right) => left.p - right.p)
  interface Block { sumY: number; count: number; maxP: number; value: number }
  const blocks: Block[] = []
  for (const point of sorted) {
    let block: Block = { sumY: point.y, count: 1, maxP: point.p, value: point.y }
    while (blocks.length > 0 && blocks[blocks.length - 1].value >= block.value) {
      const previous = blocks.pop()!
      const sumY = previous.sumY + block.sumY
      const count = previous.count + block.count
      block = { sumY, count, maxP: block.maxP, value: sumY / count }
    }
    blocks.push(block)
  }
  return (probability) => {
    for (const block of blocks) if (probability <= block.maxP) return clamp(block.value)
    return clamp(blocks.at(-1)?.value ?? probability)
  }
}

/** Temperature scaling (binário): divide o logit por T; T ajustado na validação. */
export function fitTemperature(probabilities: number[], labels: number[]): Calibrator {
  let bestT = 1
  let bestLoss = Number.POSITIVE_INFINITY
  for (let t = 0.5; t <= 3.0001; t += 0.05) {
    const loss = mean(probabilities.map((p, i) => binaryLogLoss(clamp(sigmoid(logit(p) / t)), labels[i])))
    if (loss < bestLoss) {
      bestLoss = loss
      bestT = t
    }
  }
  return (probability) => clamp(sigmoid(logit(probability) / bestT))
}

export interface CalibrationComparison {
  method: string
  before: CalibrationMetrics
  after: CalibrationMetrics
  improvesCalibration: boolean
  preservesGeneralization: boolean
  accepted: boolean
}

/**
 * Ajusta o calibrador na validação (fitProbs/fitLabels) e mede antes/depois no
 * conjunto de avaliação (evalProbs/evalLabels) — que NÃO é o teste final. Só
 * aceita se melhorar a calibração (ECE) sem piorar Brier nem log loss.
 */
export function compareCalibration(
  method: string,
  fit: (probabilities: number[], labels: number[]) => Calibrator,
  fitProbs: number[],
  fitLabels: number[],
  evalProbs: number[],
  evalLabels: number[],
): CalibrationComparison {
  const calibrator = fit(fitProbs, fitLabels)
  const before = calibrationMetrics(evalProbs, evalLabels)
  const after = calibrationMetrics(evalProbs.map(calibrator), evalLabels)
  const improvesCalibration = after.expectedCalibrationError < before.expectedCalibrationError
  const preservesGeneralization = after.brierScore <= before.brierScore + 1e-4 && after.logLoss <= before.logLoss + 1e-4
  return { method, before, after, improvesCalibration, preservesGeneralization, accepted: improvesCalibration && preservesGeneralization }
}

function binaryLogLoss(probability: number, label: number): number {
  const p = clamp(probability)
  return -(label * Math.log(p) + (1 - label) * Math.log(1 - p))
}

function logit(probability: number): number {
  const p = clamp(probability)
  return Math.log(p / (1 - p))
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(1e-6, Math.min(1 - 1e-6, value))
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
