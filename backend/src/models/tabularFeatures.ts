import type { FeatureExample, PreMatchFeatures } from '../preMatchFeatures.js'

/**
 * ETAPA 8 — Vetorização tabular com tratamento correto de valores ausentes.
 *
 * Cada feature é extraída como número OU `null` (ausente). O vetor final contém
 * (a) os valores imputados pela MÉDIA DO TREINO e (b) um indicador binário de
 * ausência por feature. Assim, "sem histórico" não é confundido com o valor 0:
 * a árvore/logística recebe tanto a imputação quanto o sinal de que faltava.
 */

type Extractor = (features: PreMatchFeatures) => number | null

const EXTRACTORS: Array<{ name: string; extract: Extractor }> = [
  { name: 'eloDiff', extract: (f) => f.eloDiff },
  { name: 'homeAdvantageAdjustedElo', extract: (f) => f.homeAdvantageAdjustedElo },
  { name: 'homeForm5Ppg', extract: (f) => (f.home.form5.sampleSize > 0 ? f.home.form5.pointsPerGame : null) },
  { name: 'awayForm5Ppg', extract: (f) => (f.away.form5.sampleSize > 0 ? f.away.form5.pointsPerGame : null) },
  { name: 'homeForm10GoalsFor', extract: (f) => (f.home.form10.sampleSize > 0 ? f.home.form10.avgGoalsFor : null) },
  { name: 'homeForm10GoalsAgainst', extract: (f) => (f.home.form10.sampleSize > 0 ? f.home.form10.avgGoalsAgainst : null) },
  { name: 'awayForm10GoalsFor', extract: (f) => (f.away.form10.sampleSize > 0 ? f.away.form10.avgGoalsFor : null) },
  { name: 'awayForm10GoalsAgainst', extract: (f) => (f.away.form10.sampleSize > 0 ? f.away.form10.avgGoalsAgainst : null) },
  { name: 'homeForm10Over25', extract: (f) => (f.home.form10.sampleSize > 0 ? f.home.form10.over25Pct : null) },
  { name: 'awayForm10Over25', extract: (f) => (f.away.form10.sampleSize > 0 ? f.away.form10.over25Pct : null) },
  { name: 'homeVenuePpg', extract: (f) => (f.home.venueForm10.sampleSize > 0 ? f.home.venueForm10.pointsPerGame : null) },
  { name: 'awayVenuePpg', extract: (f) => (f.away.venueForm10.sampleSize > 0 ? f.away.venueForm10.pointsPerGame : null) },
  { name: 'homeRestDays', extract: (f) => f.home.restDays },
  { name: 'awayRestDays', extract: (f) => f.away.restDays },
  { name: 'homeRecentOpponentElo', extract: (f) => f.home.recentOpponentElo },
  { name: 'awayRecentOpponentElo', extract: (f) => f.away.recentOpponentElo },
  { name: 'homeExpWeightedGoalsFor', extract: (f) => (f.home.hasHistory ? f.home.expWeightedGoalsFor : null) },
  { name: 'awayExpWeightedGoalsFor', extract: (f) => (f.away.hasHistory ? f.away.expWeightedGoalsFor : null) },
  { name: 'h2hHomeWinRate', extract: (f) => f.h2hHomeWinRate },
]

export interface TabularVectorizer {
  featureNames: string[]
  transform(example: FeatureExample): number[]
}

export function fitVectorizer(examples: FeatureExample[]): TabularVectorizer {
  const means = EXTRACTORS.map((extractor) => {
    const values: number[] = []
    for (const example of examples) {
      const value = extractor.extract(example.features)
      if (value !== null && Number.isFinite(value)) values.push(value)
    }
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  })

  const featureNames = [
    ...EXTRACTORS.map((extractor) => extractor.name),
    ...EXTRACTORS.map((extractor) => `${extractor.name}__missing`),
  ]

  return {
    featureNames,
    transform(example) {
      const values: number[] = []
      const missing: number[] = []
      for (let index = 0; index < EXTRACTORS.length; index += 1) {
        const raw = EXTRACTORS[index].extract(example.features)
        const isMissing = raw === null || !Number.isFinite(raw)
        values.push(isMissing ? means[index] : raw)
        missing.push(isMissing ? 1 : 0)
      }
      return [...values, ...missing]
    },
  }
}
