import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyDataStatus, computeConfidence, isSufficient, type DataStatusInputs } from './confidence.js'

const sufficientInputs: DataStatusInputs = {
  featureAvailable: true,
  competitionHasHistory: true,
  teamMatches: 30,
  competitionMatches: 100,
  marketSampleSize: 80,
  windowSize: 10,
  value: 2,
}

test('diferencia as causas de dados insuficientes', () => {
  assert.equal(classifyDataStatus(sufficientInputs), 'sufficient')
  assert.equal(classifyDataStatus({ ...sufficientInputs, value: 0 }), 'zero_value')
  assert.equal(classifyDataStatus({ ...sufficientInputs, value: undefined }), 'missing_data')
  assert.equal(classifyDataStatus({ ...sufficientInputs, marketSampleSize: 3 }), 'insufficient_sample')
  assert.equal(classifyDataStatus({ ...sufficientInputs, competitionHasHistory: false }), 'competition_no_history')
  assert.equal(classifyDataStatus({ ...sufficientInputs, teamMatches: 0 }), 'new_team')
  assert.equal(classifyDataStatus({ ...sufficientInputs, featureAvailable: false }), 'feature_unavailable')
})

test('valor zero é observação legítima, não ausência de dado', () => {
  assert.equal(isSufficient(classifyDataStatus({ ...sufficientInputs, value: 0 })), true)
  assert.equal(isSufficient('missing_data'), false)
  assert.equal(isSufficient('insufficient_sample'), false)
})

test('confiança é calculada dos seis fatores e traz aviso (não é promessa)', () => {
  const strong = computeConfidence({ sampleSize: 500, minRows: 20, foldStabilityStdDev: 0.005, calibrationEce: 0.01, skillVsBaseline: 0.05, featureAvailability: 1, uncertaintyWidth: 0.02 })
  const weak = computeConfidence({ sampleSize: 5, minRows: 20, foldStabilityStdDev: 0.05, calibrationEce: 0.15, skillVsBaseline: -0.05, featureAvailability: 0.3, uncertaintyWidth: 0.2 })

  assert.ok(strong.score > weak.score)
  assert.equal(strong.level, 'Alta')
  assert.equal(weak.level, 'Baixa')
  // Todos os seis componentes participam do score.
  assert.deepEqual(Object.keys(strong.components).sort(), ['availability', 'baseline', 'calibration', 'sample', 'stability', 'uncertainty'])
  assert.match(strong.disclaimer, /não é promessa/i)
  // Score sempre em [0, 1].
  for (const result of [strong, weak]) assert.ok(result.score >= 0 && result.score <= 1)
})

test('cada fator move a confiança na direção esperada', () => {
  const base = { sampleSize: 100, minRows: 20, foldStabilityStdDev: 0.02, calibrationEce: 0.05, skillVsBaseline: 0.02, featureAvailability: 1, uncertaintyWidth: 0.1 }
  assert.ok(computeConfidence({ ...base, sampleSize: 400 }).score > computeConfidence({ ...base, sampleSize: 30 }).score)
  assert.ok(computeConfidence({ ...base, calibrationEce: 0.01 }).score > computeConfidence({ ...base, calibrationEce: 0.09 }).score)
  assert.ok(computeConfidence({ ...base, skillVsBaseline: 0.08 }).score > computeConfidence({ ...base, skillVsBaseline: -0.08 }).score)
})
