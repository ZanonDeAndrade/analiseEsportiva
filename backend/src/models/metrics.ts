import { calibrationMetrics } from './calibration.js'

/**
 * ETAPA 11 — Métricas corretas.
 *
 * Para 1X2 a métrica principal é MULTICLASSE (argmax, Brier multiclasse, log loss
 * multiclasse, matriz de confusão, macro F1, balanced accuracy) — nunca tratando
 * cada seleção como binária independente com limiar de 50%. Para mercados binários,
 * usa Brier/log loss/balanced accuracy/precisão/recall/F1/matriz/calibração.
 *
 * Interpretação: Brier Score e Log Loss são "quanto menor, melhor".
 */

export const SCORE_INTERPRETATION = 'Brier Score e Log Loss: quanto menor, melhor. Acurácia/F1/balanced accuracy: quanto maior, melhor.'

export interface MulticlassMetrics {
  samples: number
  argmaxAccuracy: number
  multiclassBrier: number
  multiclassLogLoss: number
  confusionMatrix: number[][]
  macroF1: number
  balancedAccuracy: number
  perClassCalibrationEce: number[]
  majorityBaseline: { class: number; accuracy: number; multiclassBrier: number; multiclassLogLoss: number }
  frequencyBaseline: { multiclassBrier: number; multiclassLogLoss: number }
}

const CLASSES = 3 // 0 = casa, 1 = empate, 2 = fora

/** probabilities[i] = [pHome, pDraw, pAway]; actual[i] em {0,1,2}. */
export function multiclassMetrics(probabilities: number[][], actual: number[]): MulticlassMetrics {
  const n = probabilities.length
  const confusion = Array.from({ length: CLASSES }, () => new Array(CLASSES).fill(0))
  let correct = 0
  let brier = 0
  let logLoss = 0
  const classCounts = new Array(CLASSES).fill(0)

  for (let i = 0; i < n; i += 1) {
    const probs = normalize(probabilities[i])
    const predicted = argmax(probs)
    const truth = actual[i]
    classCounts[truth] += 1
    confusion[truth][predicted] += 1
    if (predicted === truth) correct += 1
    for (let c = 0; c < CLASSES; c += 1) brier += (probs[c] - (c === truth ? 1 : 0)) ** 2
    logLoss += -Math.log(clamp(probs[truth]))
  }

  const prevalence = classCounts.map((count) => count / Math.max(1, n))
  return {
    samples: n,
    argmaxAccuracy: round(correct / Math.max(1, n)),
    multiclassBrier: round(brier / Math.max(1, n)),
    multiclassLogLoss: round(logLoss / Math.max(1, n)),
    confusionMatrix: confusion,
    macroF1: round(macroF1(confusion)),
    balancedAccuracy: round(balancedAccuracy(confusion)),
    perClassCalibrationEce: perClassCalibration(probabilities, actual),
    majorityBaseline: majorityBaseline(prevalence, actual),
    frequencyBaseline: frequencyBaseline(prevalence, actual),
  }
}

export interface BinaryMetrics {
  samples: number
  prevalence: number
  brierScore: number
  logLoss: number
  balancedAccuracy: number
  precision: number
  recall: number
  f1: number
  confusionMatrix: { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number }
  calibrationEce: number
  frequencyBaseline: { brierScore: number; logLoss: number }
}

/** probabilities[i] = P(evento); labels[i] em {0,1}. */
export function binaryMetrics(probabilities: number[], labels: number[]): BinaryMetrics {
  const n = probabilities.length
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  let brier = 0
  let logLoss = 0
  const positives = labels.reduce((sum, value) => sum + value, 0)
  const prevalence = positives / Math.max(1, n)
  for (let i = 0; i < n; i += 1) {
    const p = clamp(probabilities[i])
    const predicted = p >= 0.5 ? 1 : 0
    if (labels[i] === 1 && predicted === 1) tp += 1
    else if (labels[i] === 0 && predicted === 1) fp += 1
    else if (labels[i] === 0 && predicted === 0) tn += 1
    else fn += 1
    brier += (p - labels[i]) ** 2
    logLoss += -(labels[i] * Math.log(p) + (1 - labels[i]) * Math.log(1 - p))
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return {
    samples: n,
    prevalence: round(prevalence),
    brierScore: round(brier / Math.max(1, n)),
    logLoss: round(logLoss / Math.max(1, n)),
    balancedAccuracy: round((recall + specificity) / 2),
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    confusionMatrix: { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn },
    calibrationEce: calibrationMetrics(probabilities, labels).expectedCalibrationError,
    frequencyBaseline: {
      brierScore: round(mean(labels.map((label) => (prevalence - label) ** 2))),
      logLoss: round(mean(labels.map((label) => -(label * Math.log(clamp(prevalence)) + (1 - label) * Math.log(1 - clamp(prevalence)))))),
    },
  }
}

export interface CoverageReport {
  totalMatches: number
  predicted: number
  insufficientData: number
  coveragePct: number
}

/** ETAPA 11.4 — cobertura sempre acompanha a acurácia. */
export function coverageReport(totalMatches: number, predicted: number, insufficientData: number): CoverageReport {
  return {
    totalMatches,
    predicted,
    insufficientData,
    coveragePct: round((predicted / Math.max(1, totalMatches)) * 100),
  }
}

function macroF1(confusion: number[][]): number {
  let sum = 0
  for (let c = 0; c < CLASSES; c += 1) {
    const tp = confusion[c][c]
    let fp = 0
    let fn = 0
    for (let other = 0; other < CLASSES; other += 1) {
      if (other !== c) {
        fp += confusion[other][c]
        fn += confusion[c][other]
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    sum += precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  }
  return sum / CLASSES
}

function balancedAccuracy(confusion: number[][]): number {
  let sum = 0
  for (let c = 0; c < CLASSES; c += 1) {
    const total = confusion[c].reduce((acc, value) => acc + value, 0)
    sum += total > 0 ? confusion[c][c] / total : 0
  }
  return sum / CLASSES
}

function perClassCalibration(probabilities: number[][], actual: number[]): number[] {
  const result: number[] = []
  for (let c = 0; c < CLASSES; c += 1) {
    result.push(calibrationMetrics(probabilities.map((probs) => normalize(probs)[c]), actual.map((truth) => (truth === c ? 1 : 0))).expectedCalibrationError)
  }
  return result
}

function majorityBaseline(prevalence: number[], actual: number[]) {
  const majority = argmax(prevalence)
  const onehot = new Array(CLASSES).fill(0)
  onehot[majority] = 1
  let brier = 0
  let logLoss = 0
  let correct = 0
  for (const truth of actual) {
    for (let c = 0; c < CLASSES; c += 1) brier += (onehot[c] - (c === truth ? 1 : 0)) ** 2
    logLoss += -Math.log(clamp(onehot[truth]))
    if (truth === majority) correct += 1
  }
  const n = Math.max(1, actual.length)
  return { class: majority, accuracy: round(correct / n), multiclassBrier: round(brier / n), multiclassLogLoss: round(logLoss / n) }
}

function frequencyBaseline(prevalence: number[], actual: number[]) {
  let brier = 0
  let logLoss = 0
  for (const truth of actual) {
    for (let c = 0; c < CLASSES; c += 1) brier += (prevalence[c] - (c === truth ? 1 : 0)) ** 2
    logLoss += -Math.log(clamp(prevalence[truth]))
  }
  const n = Math.max(1, actual.length)
  return { multiclassBrier: round(brier / n), multiclassLogLoss: round(logLoss / n) }
}

function normalize(probs: number[]): number[] {
  const total = probs.reduce((sum, value) => sum + Math.max(0, value), 0) || 1
  return probs.map((value) => Math.max(0, value) / total)
}

function argmax(values: number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[best]) best = i
  return best
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 1e-6
  return Math.max(1e-6, Math.min(1 - 1e-6, value))
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
