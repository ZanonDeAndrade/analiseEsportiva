import { canonicalDate, compareCanonical } from './dataQuality.js'
import type { EngineeredMatchRecord } from './schemas.js'

/**
 * ETAPA 4 — Split temporal explícito (treino / validação / teste final) e
 * validação walk-forward, por competição, determinístico e sem sobreposição.
 *
 * O conjunto de teste é reservado (held-out): não é usado para escolher features,
 * ajustar hiperparâmetros, selecionar modelo, decidir limiar, escolher janela ou
 * ajustar calibração. Tudo isso deve usar apenas treino + validação
 * (o "development"). Nenhuma partida futura entra no treino e nenhuma competição
 * some silenciosamente do relatório.
 */

export interface TemporalBoundary {
  from: string
  to: string
  rows: number
}

export interface CompetitionSplit {
  competition: string
  strategy: 'by_season' | 'by_ratio'
  seasons: number
  lowHistory: boolean
  note?: string
  train: TemporalBoundary
  validation: TemporalBoundary
  test: TemporalBoundary
}

export interface ThreeWaySplitReport {
  strategy: 'per_competition_three_way'
  preferSeason: boolean
  trainRatio: number
  validationRatio: number
  testRatio: number
  discardedRows: number
  train: TemporalBoundary
  validation: TemporalBoundary
  test: TemporalBoundary
  competitions: CompetitionSplit[]
}

export interface ThreeWaySplit {
  train: EngineeredMatchRecord[]
  validation: EngineeredMatchRecord[]
  test: EngineeredMatchRecord[]
  /** treino + validação (o teste fica reservado). */
  development: EngineeredMatchRecord[]
  report: ThreeWaySplitReport
}

export interface ThreeWaySplitOptions {
  trainRatio?: number
  validationRatio?: number
  testRatio?: number
  preferSeason?: boolean
  /** nº mínimo de temporadas distintas para dividir por temporada completa. */
  minSeasonsForSeasonSplit?: number
}

class TemporalLeakageError extends Error {}

interface DatedRecord {
  record: EngineeredMatchRecord
  timestamp: number
}

function toDated(records: EngineeredMatchRecord[]): { dated: DatedRecord[]; discarded: number } {
  const dated: DatedRecord[] = []
  let discarded = 0
  for (const record of records) {
    const canonical = canonicalDate(record.date)
    if (!canonical) {
      discarded += 1
      continue
    }
    dated.push({ record: { ...record, date: canonical.iso }, timestamp: canonical.timestamp })
  }
  return { dated, discarded }
}

export function temporalThreeWaySplit(
  records: EngineeredMatchRecord[],
  options: ThreeWaySplitOptions = {},
): ThreeWaySplit {
  const validationRatio = options.validationRatio ?? 0.2
  const testRatio = options.testRatio ?? 0.2
  const trainRatio = options.trainRatio ?? 1 - validationRatio - testRatio
  const preferSeason = options.preferSeason ?? true
  const minSeasons = options.minSeasonsForSeasonSplit ?? 3

  const { dated, discarded: discardedRows } = toDated(records)
  const groups = groupBy(dated, (item) => competitionOf(item.record))
  const train: EngineeredMatchRecord[] = []
  const validation: EngineeredMatchRecord[] = []
  const test: EngineeredMatchRecord[] = []
  const competitions: CompetitionSplit[] = []

  for (const competition of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
    const items = groups.get(competition)!.sort((left, right) => compareCanonical(left.record, right.record))
    const seasons = orderedSeasons(items)
    const useSeasons = preferSeason && seasons.length >= minSeasons

    let trainItems: typeof items
    let validationItems: typeof items
    let testItems: typeof items
    let strategy: CompetitionSplit['strategy']

    if (useSeasons) {
      strategy = 'by_season'
      const testSeason = seasons.at(-1)!
      const validationSeason = seasons.at(-2)!
      testItems = items.filter((item) => (item.record.season ?? '') === testSeason)
      validationItems = items.filter((item) => (item.record.season ?? '') === validationSeason)
      trainItems = items.filter(
        (item) => (item.record.season ?? '') !== testSeason && (item.record.season ?? '') !== validationSeason,
      )
    } else {
      strategy = 'by_ratio'
      const counts = threeWayCounts(items.length, validationRatio, testRatio)
      trainItems = items.slice(0, counts.train)
      validationItems = items.slice(counts.train, counts.train + counts.validation)
      testItems = items.slice(counts.train + counts.validation)
    }

    const lowHistory = seasons.length < minSeasons || items.length < 6
    const note = lowHistory
      ? `Pouco histórico (${items.length} partidas, ${seasons.length} temporada(s)); split por ${strategy}.`
      : undefined

    for (const item of trainItems) train.push(item.record)
    for (const item of validationItems) validation.push(item.record)
    for (const item of testItems) test.push(item.record)

    competitions.push({
      competition,
      strategy,
      seasons: seasons.length,
      lowHistory,
      note,
      train: boundary(trainItems.map((item) => item.record)),
      validation: boundary(validationItems.map((item) => item.record)),
      test: boundary(testItems.map((item) => item.record)),
    })
  }

  train.sort(compareCanonical)
  validation.sort(compareCanonical)
  test.sort(compareCanonical)
  assertDisjoint(train, validation, test)

  return {
    train,
    validation,
    test,
    development: [...train, ...validation].sort(compareCanonical),
    report: {
      strategy: 'per_competition_three_way',
      preferSeason,
      trainRatio: roundRatio(trainRatio),
      validationRatio: roundRatio(validationRatio),
      testRatio: roundRatio(testRatio),
      discardedRows,
      train: boundary(train),
      validation: boundary(validation),
      test: boundary(test),
      competitions,
    },
  }
}

// ---------------------------------------------------------------------------
// Walk-forward (janela expansível)
// ---------------------------------------------------------------------------

export interface WalkForwardFold {
  competition: string
  fold: number
  trainPeriods: string[]
  validationPeriod: string
  train: EngineeredMatchRecord[]
  validation: EngineeredMatchRecord[]
  trainBoundary: TemporalBoundary
  validationBoundary: TemporalBoundary
}

export interface WalkForwardPlan {
  strategy: 'season' | 'chunk'
  competitions: Array<{ competition: string; folds: number; periods: number; note?: string }>
  folds: WalkForwardFold[]
}

export interface WalkForwardOptions {
  /** nº de blocos temporais quando não há temporadas suficientes. */
  chunks?: number
  minPeriods?: number
}

/**
 * Constrói folds walk-forward por competição sobre os registros informados
 * (normalmente o development = treino + validação; o teste fica de fora).
 * Fold k treina em períodos[0..k-1] e valida no período k (janela expansível).
 */
export function walkForwardFolds(
  records: EngineeredMatchRecord[],
  options: WalkForwardOptions = {},
): WalkForwardPlan {
  const chunks = options.chunks ?? 4
  const minPeriods = options.minPeriods ?? 2

  const { dated } = toDated(records)
  const groups = groupBy(dated, (item) => competitionOf(item.record))
  const folds: WalkForwardFold[] = []
  const competitions: WalkForwardPlan['competitions'] = []
  let strategy: 'season' | 'chunk' = 'season'

  for (const competition of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
    const items = groups.get(competition)!.sort((left, right) => compareCanonical(left.record, right.record))
    const seasons = orderedSeasons(items)

    let periods: Array<{ label: string; items: typeof items }>
    if (seasons.length >= minPeriods) {
      periods = seasons.map((season) => ({
        label: season,
        items: items.filter((item) => (item.record.season ?? '') === season),
      }))
    } else {
      strategy = 'chunk'
      periods = chunkItems(items, chunks).map((chunk, index) => ({ label: `bloco-${index + 1}`, items: chunk }))
    }

    const usablePeriods = periods.filter((period) => period.items.length > 0)
    if (usablePeriods.length < minPeriods) {
      competitions.push({ competition, folds: 0, periods: usablePeriods.length, note: 'Histórico insuficiente para walk-forward.' })
      continue
    }

    let foldCount = 0
    for (let k = 1; k < usablePeriods.length; k += 1) {
      const trainPeriods = usablePeriods.slice(0, k)
      const validationPeriod = usablePeriods[k]
      const validationStart = Math.min(...validationPeriod.items.map((item) => item.timestamp))
      // Garante que nenhuma partida futura (>= início da validação) entre no treino,
      // mesmo quando os rótulos de temporada têm janelas sobrepostas.
      const trainRecords = trainPeriods
        .flatMap((period) => period.items)
        .filter((item) => item.timestamp < validationStart)
        .map((item) => item.record)
      const validationRecords = validationPeriod.items.map((item) => item.record)
      if (trainRecords.length === 0) continue
      folds.push({
        competition,
        fold: k,
        trainPeriods: trainPeriods.map((period) => period.label),
        validationPeriod: validationPeriod.label,
        train: trainRecords,
        validation: validationRecords,
        trainBoundary: boundary(trainRecords),
        validationBoundary: boundary(validationRecords),
      })
      foldCount += 1
    }
    competitions.push({ competition, folds: foldCount, periods: usablePeriods.length })
  }

  assertWalkForwardOrder(folds)
  return { strategy, competitions, folds }
}

/** Versão leve (sem os registros) para serializar em JSON. */
export function summarizeWalkForward(plan: WalkForwardPlan) {
  return {
    strategy: plan.strategy,
    competitions: plan.competitions,
    folds: plan.folds.map((fold) => ({
      competition: fold.competition,
      fold: fold.fold,
      trainPeriods: fold.trainPeriods,
      validationPeriod: fold.validationPeriod,
      trainRows: fold.train.length,
      validationRows: fold.validation.length,
      trainBoundary: fold.trainBoundary,
      validationBoundary: fold.validationBoundary,
    })),
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function competitionOf(record: EngineeredMatchRecord) {
  return record.competition ?? record.league ?? 'sem-competicao'
}

function orderedSeasons(items: Array<{ record: EngineeredMatchRecord; timestamp: number }>): string[] {
  const earliest = new Map<string, number>()
  for (const item of items) {
    const season = item.record.season
    if (!season) continue
    const current = earliest.get(season)
    if (current === undefined || item.timestamp < current) earliest.set(season, item.timestamp)
  }
  return [...earliest.entries()].sort((left, right) => left[1] - right[1]).map(([season]) => season)
}

function threeWayCounts(total: number, validationRatio: number, testRatio: number) {
  if (total <= 1) return { train: total, validation: 0, test: 0 }
  if (total === 2) return { train: 1, validation: 0, test: 1 }
  let test = Math.max(1, Math.floor(total * testRatio))
  let validation = Math.max(1, Math.floor(total * validationRatio))
  while (total - test - validation < 1) {
    if (validation > 1) validation -= 1
    else if (test > 1) test -= 1
    else break
  }
  return { train: total - test - validation, validation, test }
}

function chunkItems<T>(items: T[], chunks: number): T[][] {
  if (items.length === 0) return []
  const size = Math.ceil(items.length / chunks)
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const bucket = key(item)
    const list = groups.get(bucket) ?? []
    list.push(item)
    groups.set(bucket, list)
  }
  return groups
}

function boundary(records: EngineeredMatchRecord[]): TemporalBoundary {
  if (records.length === 0) return { from: '', to: '', rows: 0 }
  const days = records.map((record) => canonicalDate(record.date)?.iso ?? '').filter(Boolean).sort()
  return { from: days[0] ?? '', to: days.at(-1) ?? '', rows: records.length }
}

function assertDisjoint(
  train: EngineeredMatchRecord[],
  validation: EngineeredMatchRecord[],
  test: EngineeredMatchRecord[],
) {
  const trainKeys = new Set(train.map(identityKey))
  const validationKeys = new Set(validation.map(identityKey))
  for (const record of validation) {
    if (trainKeys.has(identityKey(record))) throw new TemporalLeakageError('Partida em treino e validação.')
  }
  for (const record of test) {
    const key = identityKey(record)
    if (trainKeys.has(key) || validationKeys.has(key)) throw new TemporalLeakageError('Partida em teste e em treino/validação.')
  }
}

function assertWalkForwardOrder(folds: WalkForwardFold[]) {
  for (const fold of folds) {
    if (fold.train.length === 0 || fold.validation.length === 0) continue
    const trainMax = Math.max(...fold.train.map((record) => canonicalDate(record.date)?.timestamp ?? 0))
    const validationMin = Math.min(...fold.validation.map((record) => canonicalDate(record.date)?.timestamp ?? 0))
    if (trainMax > validationMin) {
      throw new TemporalLeakageError(
        `Walk-forward inválido em ${fold.competition} fold ${fold.fold}: treino contém data posterior ao início da validação.`,
      )
    }
  }
}

function identityKey(record: EngineeredMatchRecord) {
  return `${competitionOf(record)} ${record.season ?? ''} ${record.date ?? ''} ${record.homeTeam ?? ''} ${record.awayTeam ?? ''} ${record.index}`
}

function roundRatio(value: number) {
  return Math.round(value * 1000) / 1000
}
