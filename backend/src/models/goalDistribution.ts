import type { PredictionResult } from './types.js'

const MAX_GOALS = 10
const PRECISION = 1e6

export interface GoalDistribution {
  expectedHomeGoals: number
  expectedAwayGoals: number
  homeMarginal: number[]
  awayMarginal: number[]
  matrix: number[][]
}

function poissonPmf(lambda: number, k: number): number {
  const safe = Math.max(1e-6, lambda)
  return (safe ** k * Math.exp(-safe)) / factorial(k)
}

function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i += 1) result *= i
  return result
}

/**
 * Correção de Dixon-Coles para placares baixos (dependência entre os gols dos
 * dois times em 0-0, 1-0, 0-1, 1-1). Com rho = 0 recai no Poisson independente.
 */
function dixonColesTau(home: number, away: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (home === 0 && away === 0) return 1 - lambdaHome * lambdaAway * rho
  if (home === 0 && away === 1) return 1 + lambdaHome * rho
  if (home === 1 && away === 0) return 1 + lambdaAway * rho
  if (home === 1 && away === 1) return 1 - rho
  return 1
}

/**
 * Distribuição conjunta de gols em uma matriz 0..10. A massa residual acima de
 * 10 gols é redistribuída pela renormalização (a matriz sempre soma 1), então
 * nenhuma probabilidade é perdida. Expõe também os gols esperados e as marginais.
 */
export function goalDistribution(lambdaHome: number, lambdaAway: number, rho = 0): GoalDistribution {
  const matrix: number[][] = []
  let total = 0
  for (let home = 0; home <= MAX_GOALS; home += 1) {
    matrix[home] = []
    for (let away = 0; away <= MAX_GOALS; away += 1) {
      const probability =
        poissonPmf(lambdaHome, home) *
        poissonPmf(lambdaAway, away) *
        Math.max(0, dixonColesTau(home, away, lambdaHome, lambdaAway, rho))
      matrix[home][away] = probability
      total += probability
    }
  }
  const safeTotal = total > 0 ? total : 1
  const homeMarginal = new Array(MAX_GOALS + 1).fill(0)
  const awayMarginal = new Array(MAX_GOALS + 1).fill(0)
  for (let home = 0; home <= MAX_GOALS; home += 1) {
    for (let away = 0; away <= MAX_GOALS; away += 1) {
      const probability = matrix[home][away] / safeTotal
      matrix[home][away] = probability
      homeMarginal[home] += probability
      awayMarginal[away] += probability
    }
  }
  return {
    expectedHomeGoals: round(homeMarginal.reduce((sum, probability, goals) => sum + probability * goals, 0)),
    expectedAwayGoals: round(awayMarginal.reduce((sum, probability, goals) => sum + probability * goals, 0)),
    homeMarginal,
    awayMarginal,
    matrix,
  }
}

/**
 * Deriva todos os mercados de gols da MESMA distribuição, com coerência estrutural:
 *  - 1X2 soma exatamente 1 após normalização;
 *  - Under é o complemento exato do respectivo Over;
 *  - Over 1.5 >= Over 2.5 >= Over 3.5 (somas cumulativas);
 *  - arredondamento preserva a complementaridade (o negativo deriva do positivo).
 */
export function marketsFromDistribution(distribution: GoalDistribution): PredictionResult {
  const { matrix } = distribution
  let home = 0
  let draw = 0
  let over15 = 0
  let over25 = 0
  let over35 = 0
  let bttsYes = 0
  for (let h = 0; h < matrix.length; h += 1) {
    for (let a = 0; a < matrix[h].length; a += 1) {
      const probability = matrix[h][a]
      if (h > a) home += probability
      else if (h === a) draw += probability
      const total = h + a
      if (total > 1.5) over15 += probability
      if (total > 2.5) over25 += probability
      if (total > 3.5) over35 += probability
      if (h >= 1 && a >= 1) bttsYes += probability
    }
  }
  // 1X2: normaliza para somar exatamente 1 (away = 1 - home - draw).
  const homeWin = quantize(home)
  const drawProb = quantize(draw)
  const awayWin = quantize(1 - homeWin - drawProb)

  const over15q = quantize(over15)
  const over25q = quantize(over25)
  const over35q = quantize(over35)
  const bttsq = quantize(bttsYes)

  return {
    '1X2': { home_win: homeWin, draw: drawProb, away_win: awayWin },
    DOUBLE_CHANCE: {
      '1x': quantize(homeWin + drawProb),
      '12': quantize(homeWin + awayWin),
      x2: quantize(drawProb + awayWin),
    },
    OVER_1_5_GOALS: complementaryPair('over_1_5', 'under_or_equal_1_5', over15q),
    OVER_2_5_GOALS: complementaryPair('over_2_5', 'under_or_equal_2_5', over25q),
    OVER_3_5_GOALS: complementaryPair('over_3_5', 'under_or_equal_3_5', over35q),
    UNDER_2_5_GOALS: complementaryPair('under_2_5', 'over_or_equal_2_5', quantize(1 - over25q)),
    UNDER_3_5_GOALS: complementaryPair('under_3_5', 'over_or_equal_3_5', quantize(1 - over35q)),
    BOTH_TEAMS_SCORE: complementaryPair('btts_yes', 'btts_no', bttsq),
  }
}

/** Par binário com complementaridade exata: negativo = 1 - positivo. */
function complementaryPair(positiveKey: string, negativeKey: string, positive: number) {
  return { [positiveKey]: positive, [negativeKey]: quantize(1 - positive) }
}

/** Arredonda mantendo o valor estritamente dentro de (0, 1). */
function quantize(value: number): number {
  const rounded = Math.round(value * PRECISION) / PRECISION
  return Math.max(1 / PRECISION, Math.min(1 - 1 / PRECISION, rounded))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
