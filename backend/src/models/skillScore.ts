import { movingBlockBootstrap, type BootstrapOptions, type ConfidenceInterval } from './bootstrap.js'

/**
 * ETAPA 12 — Skill score contra baselines obrigatórios.
 *
 *   skill = 1 - modelBrier / baselineBrier
 *   positivo: supera o baseline · zero: equivalente · negativo: pior.
 *
 * Resultados negativos NÃO são escondidos. O intervalo de confiança do skill vem
 * do moving block bootstrap (ETAPA 13), preservando a estrutura temporal. Quando
 * o intervalo contém zero, a diferença é estatisticamente equivalente.
 */

export interface SkillComparison {
  baseline: string
  sampleSize: number
  modelBrier: number
  baselineBrier: number
  absoluteDifference: number
  relativeDifference: number
  skillScore: number
  skillInterval: ConfidenceInterval
  verdict: 'supera' | 'equivalente' | 'pior'
}

/** Brier pareado por partida (mesma ordem cronológica) do modelo e do baseline. */
export function skillComparison(
  baseline: string,
  modelBrier: number[],
  baselineBrier: number[],
  options: BootstrapOptions = {},
): SkillComparison {
  const pairs = modelBrier.map((model, index) => ({ model, baseline: baselineBrier[index] }))
  const skillOf = (sample: Array<{ model: number; baseline: number }>) => {
    const meanBaseline = mean(sample.map((pair) => pair.baseline))
    const meanModel = mean(sample.map((pair) => pair.model))
    return meanBaseline > 0 ? 1 - meanModel / meanBaseline : 0
  }
  const meanModel = mean(modelBrier)
  const meanBaseline = mean(baselineBrier)
  const interval = movingBlockBootstrap(pairs, skillOf, options)
  const verdict: SkillComparison['verdict'] = interval.lower > 0 ? 'supera' : interval.upper < 0 ? 'pior' : 'equivalente'

  return {
    baseline,
    sampleSize: pairs.length,
    modelBrier: round(meanModel),
    baselineBrier: round(meanBaseline),
    absoluteDifference: round(meanBaseline - meanModel),
    relativeDifference: meanBaseline > 0 ? round((meanBaseline - meanModel) / meanBaseline) : 0,
    skillScore: round(meanBaseline > 0 ? 1 - meanModel / meanBaseline : 0),
    skillInterval: interval,
    verdict,
  }
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number): number {
  return Math.round(value * 100000) / 100000
}
