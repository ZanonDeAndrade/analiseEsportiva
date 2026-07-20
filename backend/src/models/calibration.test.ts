import assert from 'node:assert/strict'
import test from 'node:test'
import { calibrationMetrics, compareCalibration, fitIsotonic, fitPlatt, fitTemperature } from './calibration.js'

/** Determinístico: previsão constante p com metade dos rótulos 1. */
function constantProb(p: number, count: number) {
  const probabilities = new Array(count).fill(p)
  const labels = probabilities.map((_, index) => (index % 2 === 0 ? 1 : 0))
  return { probabilities, labels }
}

test('probabilidade 0.5 com taxa observada 0.5 tem ECE zero', () => {
  const { probabilities, labels } = constantProb(0.5, 100)
  const metrics = calibrationMetrics(probabilities, labels)
  assert.equal(metrics.expectedCalibrationError, 0)
  assert.ok(metrics.brierScore > 0)
})

test('isotônica é monotônica não-decrescente', () => {
  const probabilities = Array.from({ length: 200 }, (_, i) => i / 200)
  const labels = probabilities.map((p) => (p > 0.5 ? 1 : 0))
  const calibrator = fitIsotonic(probabilities, labels)
  let previous = -1
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const value = calibrator(p)
    assert.ok(value >= previous - 1e-9, `não monotônica em ${p}`)
    previous = value
  }
})

test('calibração melhora ECE de probabilidades enviesadas sem piorar Brier (Platt/Isotônica)', () => {
  // Modelo super-confiante: prevê 0.9 mas evento ocorre só 60% das vezes.
  const n = 400
  const probabilities = new Array(n).fill(0.9)
  const labels = probabilities.map((_, index) => (index % 10 < 6 ? 1 : 0))
  const half = Math.floor(n / 2)
  const fitProbs = probabilities.slice(0, half)
  const fitLabels = labels.slice(0, half)
  const evalProbs = probabilities.slice(half)
  const evalLabels = labels.slice(half)

  for (const fit of [fitPlatt, fitIsotonic]) {
    const comparison = compareCalibration('m', fit, fitProbs, fitLabels, evalProbs, evalLabels)
    assert.ok(comparison.after.expectedCalibrationError < comparison.before.expectedCalibrationError)
    assert.ok(comparison.accepted)
  }
})

test('temperature scaling retorna probabilidades válidas', () => {
  const probabilities = Array.from({ length: 100 }, (_, i) => 0.1 + (0.8 * i) / 100)
  const labels = probabilities.map((p) => (p > 0.5 ? 1 : 0))
  const calibrator = fitTemperature(probabilities, labels)
  for (const p of [0.05, 0.5, 0.95]) {
    const value = calibrator(p)
    assert.ok(value > 0 && value < 1)
  }
})
