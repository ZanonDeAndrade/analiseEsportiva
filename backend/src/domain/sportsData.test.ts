import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessFreshness,
  buildResultContext,
  normalizeProviderFixtureStatus,
} from './sportsData.js'

test('normaliza todos os estados operacionais sem confundir adiamento, cancelamento e abandono', () => {
  assert.equal(normalizeProviderFixtureStatus('NS'), 'not_started')
  assert.equal(normalizeProviderFixtureStatus('1H'), 'live')
  assert.equal(normalizeProviderFixtureStatus('HT'), 'halftime')
  assert.equal(normalizeProviderFixtureStatus('PST'), 'postponed')
  assert.equal(normalizeProviderFixtureStatus('CANC'), 'cancelled')
  assert.equal(normalizeProviderFixtureStatus('ABD'), 'abandoned')
  assert.equal(normalizeProviderFixtureStatus('ET'), 'extra_time')
  assert.equal(normalizeProviderFixtureStatus('P'), 'penalties')
  assert.equal(normalizeProviderFixtureStatus('PEN'), 'finished')
  assert.equal(normalizeProviderFixtureStatus('TIMED'), 'not_started')
  assert.equal(normalizeProviderFixtureStatus('IN_PLAY'), 'live')
  assert.equal(normalizeProviderFixtureStatus('PAUSED'), 'halftime')
  assert.equal(normalizeProviderFixtureStatus('FINISHED'), 'finished')
  assert.equal(normalizeProviderFixtureStatus('SUSPENDED'), 'abandoned')
})

test('resultado por penaltis preserva empate do jogo e vencedor da disputa', () => {
  assert.deepEqual(buildResultContext({
    homeGoals: 1,
    awayGoals: 1,
    homePenaltyGoals: 5,
    awayPenaltyGoals: 4,
    decision: 'penalties',
  }), {
    homeGoals: 1,
    awayGoals: 1,
    homePenaltyGoals: 5,
    awayPenaltyGoals: 4,
    decision: 'penalties',
    outcome: 'D',
    winner: 'home',
  })
})

test('dado vencido nunca e classificado como atual', () => {
  assert.equal(
    assessFreshness('2026-07-15T10:00:00.000Z', 60_000, new Date('2026-07-15T10:02:00.000Z')).state,
    'stale',
  )
  assert.equal(assessFreshness(undefined, 60_000).state, 'missing_timestamp')
})
