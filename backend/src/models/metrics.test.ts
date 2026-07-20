import assert from 'node:assert/strict'
import test from 'node:test'
import { binaryMetrics, coverageReport, multiclassMetrics } from './metrics.js'

test('1X2: métricas multiclasse (argmax, Brier/logLoss multiclasse, confusão, F1, baselines)', () => {
  // Previsões perfeitas one-hot para casa/empate/fora.
  const probabilities = [
    [0.8, 0.1, 0.1],
    [0.1, 0.8, 0.1],
    [0.1, 0.1, 0.8],
    [0.7, 0.2, 0.1],
  ]
  const actual = [0, 1, 2, 0]
  const metrics = multiclassMetrics(probabilities, actual)

  assert.equal(metrics.samples, 4)
  assert.equal(metrics.argmaxAccuracy, 1) // todas corretas por argmax
  assert.ok(metrics.multiclassBrier > 0 && metrics.multiclassBrier < 1)
  assert.ok(metrics.multiclassLogLoss > 0)
  // Confusão diagonal (todas corretas).
  assert.equal(metrics.confusionMatrix[0][0], 2)
  assert.equal(metrics.confusionMatrix[1][1], 1)
  assert.equal(metrics.confusionMatrix[2][2], 1)
  assert.ok(metrics.macroF1 > 0 && metrics.macroF1 <= 1)
  assert.ok(metrics.balancedAccuracy > 0 && metrics.balancedAccuracy <= 1)
  assert.equal(metrics.perClassCalibrationEce.length, 3)
  // Baselines presentes.
  assert.ok(metrics.majorityBaseline.multiclassBrier >= 0)
  assert.ok(metrics.frequencyBaseline.multiclassBrier >= 0)
  // O modelo perfeito deve superar (Brier menor) o baseline de frequência.
  assert.ok(metrics.multiclassBrier < metrics.frequencyBaseline.multiclassBrier)
})

test('mercado binário: precisão/recall/F1/balanced accuracy coerentes', () => {
  const probabilities = [0.9, 0.8, 0.2, 0.1, 0.6, 0.3]
  const labels = [1, 1, 0, 0, 1, 0]
  const metrics = binaryMetrics(probabilities, labels)
  assert.equal(metrics.samples, 6)
  assert.equal(metrics.prevalence, 0.5)
  // Previsões (limiar 0,5): 1,1,0,0,1,0 -> todas corretas.
  assert.equal(metrics.precision, 1)
  assert.equal(metrics.recall, 1)
  assert.equal(metrics.f1, 1)
  assert.equal(metrics.balancedAccuracy, 1)
  assert.equal(metrics.confusionMatrix.truePositive, 3)
  assert.equal(metrics.confusionMatrix.trueNegative, 3)
  assert.ok(metrics.brierScore >= 0 && metrics.logLoss >= 0)
})

test('cobertura calcula o percentual previsto', () => {
  const coverage = coverageReport(100, 80, 20)
  assert.equal(coverage.coveragePct, 80)
  assert.equal(coverage.insufficientData, 20)
})
