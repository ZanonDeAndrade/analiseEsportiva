import { createHash } from 'node:crypto'
import { deriveMarketLabels, marketDefinitions } from './markets.js'
import { predictMarkets } from './prediction.js'
import { DEFAULT_MLOPS_SEED, FEATURE_SET_VERSION, MODEL_SCHEMA_VERSION } from './training.js'
import { teamKey } from './teamNames.js'
import {
  MARKET_IDS,
  type BetIntelModel,
  type EngineeredMatchRecord,
  type MarketId,
  type MarketModel,
  type PredictionRequest,
  type PredictionResponse,
  type SegmentModel,
  type TeamProfile,
} from './schemas.js'

export interface IncrementalModelOptions {
  minRows?: number
  seed?: number
  codeVersion?: string
  featureSetVersion?: string
  generatedAt?: string
}

interface SegmentCounters {
  sampleSize: number
  positiveCounts: Record<string, number>
}

interface MarketCounters {
  usableRows: number
  columnsUsed: Set<string>
  segments: Map<string, SegmentCounters>
}

/**
 * ETAPA 16 — Modelo de frequências + perfis mantido INCREMENTALMENTE.
 *
 * Como o modelo é aditivo (contadores por segmento e perfis por time), acumular
 * uma partida por vez produz exatamente o mesmo modelo que treinar do zero sobre
 * todas as partidas anteriores — permitindo backtest ~linear sem retreino O(n²).
 * A predição usa apenas o estado já acumulado (sem look-ahead).
 */
export class IncrementalFrequencyModel {
  private readonly minRows: number
  private readonly options: IncrementalModelOptions
  private readonly markets = new Map<MarketId, MarketCounters>()
  private readonly profiles = new Map<string, TeamProfile>()
  private readonly sourceProviders = new Set<string>()
  private readonly competitions = new Set<string>()
  private trainingRows = 0
  private earliestDate: string | undefined
  private latestDate: string | undefined
  private latestUpdatedAt: string | undefined

  constructor(options: IncrementalModelOptions = {}) {
    this.minRows = options.minRows ?? 20
    this.options = options
    for (const market of MARKET_IDS) this.markets.set(market, { usableRows: 0, columnsUsed: new Set(), segments: new Map() })
  }

  /** Adiciona uma partida ao estado (chamado SÓ depois de prever a partida). */
  update(record: EngineeredMatchRecord): void {
    this.trainingRows += 1
    if (record.sourceProvider) this.sourceProviders.add(record.sourceProvider)
    const competition = record.competition ?? record.league
    if (competition) this.competitions.add(competition)
    if (record.date) {
      if (!this.earliestDate || record.date < this.earliestDate) this.earliestDate = record.date
      if (!this.latestDate || record.date > this.latestDate) this.latestDate = record.date
    }
    if (record.updatedAt && (!this.latestUpdatedAt || record.updatedAt > this.latestUpdatedAt)) this.latestUpdatedAt = record.updatedAt

    if (record.homeTeam && record.awayTeam) {
      this.updateProfile(this.profileFor(record.homeTeam), record, 'home')
      this.updateProfile(this.profileFor(record.awayTeam), record, 'away')
    }

    for (const market of MARKET_IDS) {
      const labels = deriveMarketLabels(record, market)
      if (!labels) continue
      const counters = this.markets.get(market)!
      counters.usableRows += 1
      for (const column of labels.columnsUsed) counters.columnsUsed.add(column)
      const selectionKeys = marketDefinitions[market].selections.map((selection) => selection.key)
      for (const segmentKey of this.segmentKeysFor(record)) {
        const segment = ensureSegment(counters.segments, segmentKey, selectionKeys)
        segment.sampleSize += 1
        for (const key of selectionKeys) if (labels.labels[key]) segment.positiveCounts[key] += 1
      }
    }
  }

  /** Predição a partir do estado atual (equivalente a treinar sobre o passado). */
  predict(request: PredictionRequest): PredictionResponse {
    return predictMarkets(this.snapshot(), request)
  }

  /** Reconstrói um BetIntelModel a partir dos contadores acumulados. */
  snapshot(): BetIntelModel {
    const markets = Object.fromEntries(
      MARKET_IDS.map((market) => [market, this.marketModel(market)]),
    ) as BetIntelModel['markets']
    const codeVersion = this.options.codeVersion ?? process.env.APP_RELEASE?.trim() ?? 'development'
    const featureSetVersion = this.options.featureSetVersion ?? FEATURE_SET_VERSION
    const trainingPeriod = { from: this.earliestDate ?? 'unknown', to: this.latestDate ?? 'unknown' }
    const now = this.options.generatedAt ?? 'incremental'
    return {
      version: 1,
      createdAt: now,
      updatedAt: this.latestUpdatedAt ?? now,
      minRows: this.minRows,
      trainingRows: this.trainingRows,
      sourceProviders: [...this.sourceProviders],
      competitions: [...this.competitions],
      teamProfiles: Object.fromEntries(this.profiles),
      markets,
      provenance: {
        codeVersion,
        featureSetVersion,
        modelSchemaVersion: MODEL_SCHEMA_VERSION,
        hyperparameters: { minRows: this.minRows, seed: this.options.seed ?? DEFAULT_MLOPS_SEED },
        trainingPeriod,
        artifactFingerprint: createHash('sha256').update(`incremental:${this.trainingRows}:${trainingPeriod.from}:${trainingPeriod.to}`).digest('hex'),
        runtime: { node: process.version, platform: process.platform, architecture: process.arch },
      },
    }
  }

  private marketModel(market: MarketId): MarketModel {
    const counters = this.markets.get(market)!
    const definition = marketDefinitions[market]
    const selectionKeys = definition.selections.map((selection) => selection.key)
    const global = this.segmentModel('global', counters.segments.get('global'), selectionKeys)
    const segments = Object.fromEntries(
      [...counters.segments.entries()]
        .filter(([key]) => key !== 'global')
        .map(([key, value]) => [key, this.segmentModel(key, value, selectionKeys)]),
    )
    const base = {
      market,
      displayName: definition.displayName,
      minRows: this.minRows,
      usableRows: counters.usableRows,
      columnsUsed: [...counters.columnsUsed],
      selections: definition.selections,
      global,
      segments,
    }
    if (global.status === 'insufficient_data') {
      return { ...base, status: 'insufficient_data', reason: this.insufficientReason(market, counters.usableRows) }
    }
    return { ...base, status: 'available' }
  }

  private segmentModel(segmentKey: string, counters: SegmentCounters | undefined, selectionKeys: string[]): SegmentModel {
    const sampleSize = counters?.sampleSize ?? 0
    const positiveCounts = Object.fromEntries(selectionKeys.map((key) => [key, counters?.positiveCounts[key] ?? 0]))
    const totalCounts = Object.fromEntries(selectionKeys.map((key) => [key, sampleSize]))
    const probabilities = Object.fromEntries(
      selectionKeys.map((key) => [key, sampleSize === 0 ? 0 : Math.round((positiveCounts[key] / sampleSize) * 1000) / 10]),
    )
    const period = { from: this.earliestDate ?? 'unknown', to: this.latestDate ?? 'unknown' }
    if (sampleSize < this.minRows) {
      return { segmentKey, status: 'insufficient_data', sampleSize, probabilities, positiveCounts, totalCounts, reason: `Amostra insuficiente: ${sampleSize}/${this.minRows} linhas com labels válidos.`, period }
    }
    return { segmentKey, status: 'available', sampleSize, probabilities, positiveCounts, totalCounts, period }
  }

  private insufficientReason(market: MarketId, usableRows: number): string {
    const definition = marketDefinitions[market]
    const columns = [...definition.requiredColumns, ...definition.optionalColumns]
    const columnText = columns.length > 0 ? ` Colunas esperadas: ${columns.join(', ')}.` : ''
    return `Dados insuficientes para treinar ${definition.displayName}: ${usableRows}/${this.minRows} linhas válidas.${columnText}`
  }

  private segmentKeysFor(record: EngineeredMatchRecord): string[] {
    const league = record.league ?? 'unknown'
    const competition = record.competition
    const keys = ['global', league]
    if (record.season) {
      keys.push(`season:${record.season}`, `${league}::${record.season}`)
      if (competition) keys.push(`${competition}::${record.season}`)
    }
    if (competition) keys.push(competition, `competition:${competition}`)
    return keys
  }

  private profileFor(name: string): TeamProfile {
    const key = teamKey(name)
    const existing = this.profiles.get(key)
    if (existing) return existing
    const profile: TeamProfile = {
      key, name, matches: 0, homeMatches: 0, awayMatches: 0, wins: 0, draws: 0, losses: 0,
      homeWins: 0, homeDraws: 0, homeLosses: 0, awayWins: 0, awayDraws: 0, awayLosses: 0,
      goalsFor: 0, goalsAgainst: 0, homeGoalsFor: 0, homeGoalsAgainst: 0, awayGoalsFor: 0, awayGoalsAgainst: 0,
      over15: 0, over25: 0, over35: 0, bothTeamsScore: 0,
      cornersRows: 0, cornersOver85: 0, cornersOver95: 0, cardsRows: 0, cardsOver35: 0, cardsOver45: 0, cardsOver55: 0,
    }
    this.profiles.set(key, profile)
    return profile
  }

  private updateProfile(profile: TeamProfile, record: EngineeredMatchRecord, side: 'home' | 'away'): void {
    const isHome = side === 'home'
    const goalsFor = isHome ? record.fullTimeHomeGoals : record.fullTimeAwayGoals
    const goalsAgainst = isHome ? record.fullTimeAwayGoals : record.fullTimeHomeGoals
    const won = goalsFor > goalsAgainst
    const draw = goalsFor === goalsAgainst
    profile.matches += 1
    profile.goalsFor += goalsFor
    profile.goalsAgainst += goalsAgainst
    if (won) profile.wins += 1
    else if (draw) profile.draws += 1
    else profile.losses += 1
    if (isHome) {
      profile.homeMatches += 1
      profile.homeGoalsFor += goalsFor
      profile.homeGoalsAgainst += goalsAgainst
      if (won) profile.homeWins += 1
      else if (draw) profile.homeDraws += 1
      else profile.homeLosses += 1
    } else {
      profile.awayMatches += 1
      profile.awayGoalsFor += goalsFor
      profile.awayGoalsAgainst += goalsAgainst
      if (won) profile.awayWins += 1
      else if (draw) profile.awayDraws += 1
      else profile.awayLosses += 1
    }
    if (record.totalGoals > 1.5) profile.over15 += 1
    if (record.totalGoals > 2.5) profile.over25 += 1
    if (record.totalGoals > 3.5) profile.over35 += 1
    if (record.fullTimeHomeGoals > 0 && record.fullTimeAwayGoals > 0) profile.bothTeamsScore += 1
    if (record.totalCorners !== undefined) {
      profile.cornersRows += 1
      if (record.totalCorners > 8.5) profile.cornersOver85 += 1
      if (record.totalCorners > 9.5) profile.cornersOver95 += 1
    }
    if (record.totalCards !== undefined) {
      profile.cardsRows += 1
      if (record.totalCards > 3.5) profile.cardsOver35 += 1
      if (record.totalCards > 4.5) profile.cardsOver45 += 1
      if (record.totalCards > 5.5) profile.cardsOver55 += 1
    }
  }
}

function ensureSegment(segments: Map<string, SegmentCounters>, key: string, selectionKeys: string[]): SegmentCounters {
  const existing = segments.get(key)
  if (existing) return existing
  const created: SegmentCounters = { sampleSize: 0, positiveCounts: Object.fromEntries(selectionKeys.map((selection) => [selection, 0])) }
  segments.set(key, created)
  return created
}
