import assert from 'node:assert/strict'
import test from 'node:test'
import { goalDistribution, marketsFromDistribution } from './goalDistribution.js'

test('a distribuição expõe gols esperados coerentes com lambda e marginais que somam 1', () => {
  for (const [lambdaHome, lambdaAway] of [[1.6, 1.1], [2.3, 0.9], [0.7, 2.4]]) {
    const distribution = goalDistribution(lambdaHome, lambdaAway)
    assert.ok(Math.abs(distribution.expectedHomeGoals - lambdaHome) < 0.2)
    assert.ok(Math.abs(distribution.expectedAwayGoals - lambdaAway) < 0.2)
    assert.ok(Math.abs(distribution.homeMarginal.reduce((sum, value) => sum + value, 0) - 1) < 1e-9)
  }
})

test('ETAPA 7: coerência estrutural dos mercados de gols', () => {
  for (const [lambdaHome, lambdaAway] of [[1.6, 1.1], [2.3, 0.9], [0.7, 2.4], [1.2, 1.2]]) {
    const markets = marketsFromDistribution(goalDistribution(lambdaHome, lambdaAway))
    const x2 = markets['1X2']!

    // 1X2 soma exatamente 1 (após normalização).
    assert.ok(Math.abs(x2.home_win + x2.draw + x2.away_win - 1) < 1e-4)
    // Under é o complemento exato do respectivo Over.
    assert.ok(Math.abs(markets.UNDER_2_5_GOALS!.under_2_5 - (1 - markets.OVER_2_5_GOALS!.over_2_5)) < 1e-5)
    assert.ok(Math.abs(markets.UNDER_3_5_GOALS!.under_3_5 - (1 - markets.OVER_3_5_GOALS!.over_3_5)) < 1e-5)
    // Cada par binário soma 1.
    assert.ok(Math.abs(markets.OVER_2_5_GOALS!.over_2_5 + markets.OVER_2_5_GOALS!.under_or_equal_2_5 - 1) < 1e-5)
    assert.ok(Math.abs(markets.BOTH_TEAMS_SCORE!.btts_yes + markets.BOTH_TEAMS_SCORE!.btts_no - 1) < 1e-5)
    // Monotonicidade Over 1.5 >= Over 2.5 >= Over 3.5.
    assert.ok(markets.OVER_1_5_GOALS!.over_1_5 >= markets.OVER_2_5_GOALS!.over_2_5)
    assert.ok(markets.OVER_2_5_GOALS!.over_2_5 >= markets.OVER_3_5_GOALS!.over_3_5)
    // Todas as probabilidades no intervalo aberto (0, 1).
    for (const market of Object.values(markets)) {
      for (const probability of Object.values(market)) assert.ok(probability > 0 && probability < 1)
    }
  }
})

test('Dixon-Coles altera placares baixos em relação ao Poisson independente', () => {
  const poisson = goalDistribution(1.3, 1.1, 0)
  const dixonColes = goalDistribution(1.3, 1.1, -0.05)
  assert.notEqual(poisson.matrix[0][0], dixonColes.matrix[0][0])
  assert.notEqual(poisson.matrix[1][1], dixonColes.matrix[1][1])
})
