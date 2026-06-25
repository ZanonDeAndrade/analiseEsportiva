import {
  MARKET_IDS,
  type BetIntelModel,
  type EngineeredMatchRecord,
  type MarketId,
  type MarketModel,
  type SegmentModel,
  type TeamProfile,
} from './schemas.js'
import { deriveMarketLabels, marketDefinitions } from './markets.js'
import { teamKey } from './teamNames.js'

export interface TrainingOptions {
  minRows?: number
}

const DEFAULT_MIN_ROWS = 20

export function trainModel(
  records: EngineeredMatchRecord[],
  options: TrainingOptions = {},
): BetIntelModel {
  const minRows = options.minRows ?? DEFAULT_MIN_ROWS
  const markets = Object.fromEntries(
    MARKET_IDS.map((market) => [market, trainMarket(records, market, minRows)]),
  ) as BetIntelModel['markets']

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: latestUpdatedAt(records) ?? new Date().toISOString(),
    minRows,
    trainingRows: records.length,
    sourceProviders: unique(records.map((record) => record.sourceProvider).filter(isString)),
    competitions: unique(records.map((record) => record.competition ?? record.league).filter(isString)),
    teamProfiles: buildTeamProfiles(records),
    markets,
  }
}

export function trainMarket(
  records: EngineeredMatchRecord[],
  market: MarketId,
  minRows: number,
): MarketModel {
  const definition = marketDefinitions[market]
  const labelled = records
    .map((record) => ({ record, labels: deriveMarketLabels(record, market) }))
    .filter((entry): entry is { record: EngineeredMatchRecord; labels: NonNullable<typeof entry.labels> } =>
      entry.labels !== null,
    )

  const columnsUsed = [...new Set(labelled.flatMap((entry) => entry.labels.columnsUsed))]
  const global = buildSegmentModel('global', labelled, definition.selections.map((item) => item.key), minRows)
  const segments = buildContextSegments(labelled, definition.selections.map((item) => item.key), minRows)

  if (global.status === 'insufficient_data') {
    return {
      market,
      displayName: definition.displayName,
      status: 'insufficient_data',
      minRows,
      usableRows: labelled.length,
      columnsUsed,
      selections: definition.selections,
      global,
      segments,
      reason: insufficientReason(market, labelled.length, minRows),
    }
  }

  return {
    market,
    displayName: definition.displayName,
    status: 'available',
    minRows,
    usableRows: labelled.length,
    columnsUsed,
    selections: definition.selections,
    global,
    segments,
  }
}

function buildContextSegments(
  labelled: Array<{
    record: EngineeredMatchRecord
    labels: { labels: Record<string, boolean> }
  }>,
  selectionKeys: string[],
  minRows: number,
) {
  const groups = new Map<string, typeof labelled>()

  for (const entry of labelled) {
    const league = entry.record.league ?? 'unknown'
    const competition = entry.record.competition
    addToGroup(groups, league, entry)

    if (entry.record.season) {
      addToGroup(groups, `season:${entry.record.season}`, entry)
      addToGroup(groups, `${league}::${entry.record.season}`, entry)

      if (competition) {
        addToGroup(groups, `${competition}::${entry.record.season}`, entry)
      }
    }

    if (competition) {
      addToGroup(groups, competition, entry)
      addToGroup(groups, `competition:${competition}`, entry)
    }
  }

  return Object.fromEntries(
    Array.from(groups.entries()).map(([league, rows]) => [
      league,
      buildSegmentModel(league, rows, selectionKeys, minRows),
    ]),
  )
}

function addToGroup<T>(groups: Map<string, T[]>, key: string, entry: T) {
  const current = groups.get(key) ?? []
  current.push(entry)
  groups.set(key, current)
}

function buildSegmentModel(
  segmentKey: string,
  labelled: Array<{ labels: { labels: Record<string, boolean> } }>,
  selectionKeys: string[],
  minRows: number,
): SegmentModel {
  const sampleSize = labelled.length
  const positiveCounts = Object.fromEntries(selectionKeys.map((key) => [key, 0])) as Record<
    string,
    number
  >
  const totalCounts = Object.fromEntries(selectionKeys.map((key) => [key, sampleSize])) as Record<
    string,
    number
  >

  for (const entry of labelled) {
    for (const key of selectionKeys) {
      if (entry.labels.labels[key]) positiveCounts[key] += 1
    }
  }

  const probabilities = Object.fromEntries(
    selectionKeys.map((key) => [
      key,
      sampleSize === 0 ? 0 : Math.round((positiveCounts[key] / sampleSize) * 1000) / 10,
    ]),
  ) as Record<string, number>

  if (sampleSize < minRows) {
    return {
      segmentKey,
      status: 'insufficient_data',
      sampleSize,
      probabilities,
      positiveCounts,
      totalCounts,
      reason: `Amostra insuficiente: ${sampleSize}/${minRows} linhas com labels válidos.`,
    }
  }

  return {
    segmentKey,
    status: 'available',
    sampleSize,
    probabilities,
    positiveCounts,
    totalCounts,
  }
}

function insufficientReason(market: MarketId, usableRows: number, minRows: number) {
  const definition = marketDefinitions[market]
  const columns = [...definition.requiredColumns, ...definition.optionalColumns]
  const columnText = columns.length > 0 ? ` Colunas esperadas: ${columns.join(', ')}.` : ''

  return `Dados insuficientes para treinar ${definition.displayName}: ${usableRows}/${minRows} linhas válidas.${columnText}`
}
 
function unique(values: string[]) {
  return [...new Set(values)]
}

function isString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0
}

function latestUpdatedAt(records: EngineeredMatchRecord[]) {
  const values = records.map((record) => record.updatedAt).filter(isString).sort()
  return values.at(-1)
}

function buildTeamProfiles(records: EngineeredMatchRecord[]) {
  const profiles = new Map<string, TeamProfile>()

  for (const record of records) {
    if (!record.homeTeam || !record.awayTeam) continue

    const home = profileFor(profiles, record.homeTeam)
    const away = profileFor(profiles, record.awayTeam)

    updateProfile(home, record, 'home')
    updateProfile(away, record, 'away')
  }

  return Object.fromEntries(profiles.entries())
}

function profileFor(profiles: Map<string, TeamProfile>, name: string) {
  const key = teamKey(name)
  const existing = profiles.get(key)
  if (existing) return existing

  const profile: TeamProfile = {
    key,
    name,
    matches: 0,
    homeMatches: 0,
    awayMatches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    homeWins: 0,
    homeDraws: 0,
    homeLosses: 0,
    awayWins: 0,
    awayDraws: 0,
    awayLosses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    homeGoalsFor: 0,
    homeGoalsAgainst: 0,
    awayGoalsFor: 0,
    awayGoalsAgainst: 0,
    over15: 0,
    over25: 0,
    over35: 0,
    bothTeamsScore: 0,
    cornersRows: 0,
    cornersOver85: 0,
    cornersOver95: 0,
    cardsRows: 0,
    cardsOver35: 0,
    cardsOver45: 0,
    cardsOver55: 0,
  }

  profiles.set(key, profile)
  return profile
}

function updateProfile(profile: TeamProfile, record: EngineeredMatchRecord, side: 'home' | 'away') {
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

