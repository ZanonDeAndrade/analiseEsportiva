/**
 * ETAPA 13 — Incerteza estatística por bootstrap de BLOCOS (moving block).
 *
 * Reamostrar partidas individuais destruiria a estrutura temporal (jogos
 * próximos no tempo são dependentes). O moving block bootstrap reamostra blocos
 * de partidas consecutivas (ordenadas por tempo), preservando a dependência
 * cronológica local. O gerador é determinístico por seed, então o intervalo é
 * reproduzível.
 */

export interface ConfidenceInterval {
  central: number
  lower: number
  upper: number
  method: string
  repetitions: number
  seed: number
  blockSize: number
  sampleSize: number
}

export interface BootstrapOptions {
  repetitions?: number
  seed?: number
  blockSize?: number
  level?: number
}

export function movingBlockBootstrap<T>(
  items: T[],
  statistic: (sample: T[]) => number,
  options: BootstrapOptions = {},
): ConfidenceInterval {
  const repetitions = options.repetitions ?? 1000
  const seed = options.seed ?? 2026
  const level = options.level ?? 0.95
  const n = items.length
  const blockSize = options.blockSize ?? Math.max(1, Math.round(Math.sqrt(n)))
  const central = round(statistic(items))

  if (n === 0) {
    return { central, lower: central, upper: central, method: 'moving-block-bootstrap', repetitions, seed, blockSize, sampleSize: n }
  }

  const random = seededRandom(seed)
  const maxStart = Math.max(1, n - blockSize + 1)
  const estimates: number[] = []
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const sample: T[] = []
    while (sample.length < n) {
      const start = Math.floor(random() * maxStart)
      for (let k = 0; k < blockSize && sample.length < n; k += 1) sample.push(items[start + k])
    }
    estimates.push(statistic(sample))
  }
  estimates.sort((left, right) => left - right)
  const alpha = (1 - level) / 2
  return {
    central,
    lower: round(percentile(estimates, alpha)),
    upper: round(percentile(estimates, 1 - alpha)),
    method: 'moving-block-bootstrap',
    repetitions,
    seed,
    blockSize,
    sampleSize: n,
  }
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0
  const position = Math.min(sorted.length - 1, Math.max(0, Math.floor(quantile * (sorted.length - 1))))
  return sorted[position]
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function round(value: number): number {
  return Math.round(value * 100000) / 100000
}
