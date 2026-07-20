import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransition, evaluatePromotion, type PromotionInputs } from './promotion.js'

const passing: PromotionInputs = {
  perFoldBrierSkill: [0.02, 0.01, 0.03, 0.015],
  perCompetitionBrierSkill: [
    { competition: 'A', skill: 0.02 },
    { competition: 'B', skill: 0.01 },
    { competition: 'C', skill: 0.03 },
  ],
  brierSkillVsBaseline: 0.02,
  logLossSkillVsBaseline: 0.015,
  calibrationEceDelta: 0.003,
  coveragePct: 100,
  importantMarketRegression: -0.001,
  runtimeMs: 4000,
  testsPassed: true,
  metadataComplete: true,
}

test('modelo que cumpre todos os critérios é validated', () => {
  const decision = evaluatePromotion(passing)
  assert.equal(decision.status, 'validated')
  assert.equal(decision.passedCount, decision.totalCriteria)
  assert.equal(decision.reasons.length, 0)
})

test('maior acurácia não valida: falha de calibração ou regressão reprova', () => {
  const worseCalibration = evaluatePromotion({ ...passing, calibrationEceDelta: 0.05 })
  assert.equal(worseCalibration.status, 'rejected')
  assert.ok(worseCalibration.reasons.some((reason) => reason.includes('calibração')))

  const marketRegression = evaluatePromotion({ ...passing, importantMarketRegression: 0.01 })
  assert.equal(marketRegression.status, 'rejected')

  const inconsistent = evaluatePromotion({ ...passing, perFoldBrierSkill: [0.02, -0.03, -0.04, -0.01] })
  assert.equal(inconsistent.status, 'rejected')
  assert.ok(inconsistent.reasons.some((reason) => reason.includes('folds')))

  const testsFailing = evaluatePromotion({ ...passing, testsPassed: false })
  assert.equal(testsFailing.status, 'rejected')
})

test('não supera baseline: reprovado mesmo com boa calibração', () => {
  const decision = evaluatePromotion({ ...passing, brierSkillVsBaseline: -0.01, logLossSkillVsBaseline: -0.02 })
  assert.equal(decision.status, 'rejected')
  assert.ok(decision.reasons.some((reason) => reason.includes('baseline')))
})

test('ciclo de vida permite apenas transições válidas', () => {
  assert.equal(canTransition('candidate', 'validated'), true)
  assert.equal(canTransition('validated', 'active'), true)
  assert.equal(canTransition('active', 'archived'), true)
  assert.equal(canTransition('candidate', 'active'), false)
  assert.equal(canTransition('archived', 'active'), false)
})
