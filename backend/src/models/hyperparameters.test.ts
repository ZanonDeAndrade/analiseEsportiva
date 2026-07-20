import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_HYPERPARAMETERS, gridSearch, validateHyperparameters } from './hyperparameters.js'

test('a configuração padrão é válida', () => {
  assert.deepEqual(validateHyperparameters(DEFAULT_HYPERPARAMETERS), [])
})

test('combinações inválidas são rejeitadas antes de treinar', () => {
  const notAscending = validateHyperparameters({ ...DEFAULT_HYPERPARAMETERS, featureWindows: [10, 5] })
  assert.ok(notAscending.some((issue) => issue.field === 'featureWindows'))

  const badElo = validateHyperparameters({ ...DEFAULT_HYPERPARAMETERS, eloK: 0 })
  assert.ok(badElo.some((issue) => issue.field === 'eloK'))

  const badDepth = validateHyperparameters({ ...DEFAULT_HYPERPARAMETERS, gbm: { ...DEFAULT_HYPERPARAMETERS.gbm, maxDepth: 10 } })
  assert.ok(badDepth.some((issue) => issue.field === 'gbm.maxDepth'))

  const badRho = validateHyperparameters({ ...DEFAULT_HYPERPARAMETERS, poisson: { shrinkage: 4, rho: 2 } })
  assert.ok(badRho.some((issue) => issue.field === 'poisson.rho'))
})

test('gridSearch registra experimentos, pula inválidos, escolhe o melhor e respeita o limite', () => {
  const grid = [{ x: 3 }, { x: 1 }, { x: -1 }, { x: 2 }, { x: 5 }]
  const result = gridSearch(
    'teste',
    grid,
    (config) => (config.x > 0 ? [] : [{ field: 'x', message: 'deve ser positivo' }]),
    (config) => config.x, // menor é melhor
    { seed: 99, maxExperiments: 4 },
  )
  assert.equal(result.space, 'teste')
  assert.equal(result.seed, 99)
  assert.equal(result.gridSize, 5)
  assert.equal(result.experiments.length, 4) // respeita maxExperiments
  assert.equal(result.skipped, 1) // x = -1 é inválido
  assert.equal(result.evaluated, 3)
  assert.deepEqual(result.best, { x: 1 }) // menor score válido dentro do limite
  assert.equal(result.bestScore, 1)
})

test('gridSearch é determinístico', () => {
  const grid = [{ x: 2 }, { x: 1 }, { x: 3 }]
  const evaluate = (config: { x: number }) => config.x
  const a = gridSearch('t', grid, () => [], evaluate, { seed: 1 })
  const b = gridSearch('t', grid, () => [], evaluate, { seed: 1 })
  assert.deepEqual(a, b)
})
