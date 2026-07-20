import assert from 'node:assert/strict'
import test from 'node:test'
import { movingBlockBootstrap } from './bootstrap.js'
import { skillComparison } from './skillScore.js'

test('moving block bootstrap é determinístico por seed e reporta método/repetições/seed', () => {
  const values = Array.from({ length: 200 }, (_, i) => (i % 5) / 5)
  const mean = (sample: number[]) => sample.reduce((sum, value) => sum + value, 0) / Math.max(1, sample.length)
  const a = movingBlockBootstrap(values, mean, { repetitions: 300, seed: 42 })
  const b = movingBlockBootstrap(values, mean, { repetitions: 300, seed: 42 })
  assert.deepEqual(a, b)
  assert.equal(a.method, 'moving-block-bootstrap')
  assert.equal(a.repetitions, 300)
  assert.equal(a.seed, 42)
  assert.equal(a.sampleSize, 200)
  assert.ok(a.blockSize >= 1)
  // Intervalo contém a estimativa central e é ordenado.
  assert.ok(a.lower <= a.central && a.central <= a.upper)
})

test('seeds diferentes produzem intervalos (levemente) diferentes', () => {
  const values = Array.from({ length: 120 }, (_, i) => (i % 7) / 7)
  const mean = (sample: number[]) => sample.reduce((sum, value) => sum + value, 0) / Math.max(1, sample.length)
  const a = movingBlockBootstrap(values, mean, { repetitions: 300, seed: 1 })
  const b = movingBlockBootstrap(values, mean, { repetitions: 300, seed: 2 })
  assert.notDeepEqual(a, b)
})

test('skill score: positivo quando supera, negativo quando pior, e detecta equivalência', () => {
  const n = 300
  // Modelo claramente melhor: Brier menor em toda partida.
  const better = skillComparison('baseline', new Array(n).fill(0.2), new Array(n).fill(0.3), { repetitions: 200, seed: 7 })
  assert.ok(better.skillScore > 0)
  assert.equal(better.verdict, 'supera')
  assert.ok(better.skillInterval.lower > 0)

  // Modelo pior.
  const worse = skillComparison('baseline', new Array(n).fill(0.35), new Array(n).fill(0.3), { repetitions: 200, seed: 7 })
  assert.ok(worse.skillScore < 0)
  assert.equal(worse.verdict, 'pior')

  // Empate: mesmos Brier -> skill 0 e intervalo contém 0 (equivalente).
  const equal = skillComparison('baseline', new Array(n).fill(0.25), new Array(n).fill(0.25), { repetitions: 200, seed: 7 })
  assert.equal(equal.skillScore, 0)
  assert.equal(equal.verdict, 'equivalente')
  assert.ok(equal.skillInterval.lower <= 0 && equal.skillInterval.upper >= 0)
})
