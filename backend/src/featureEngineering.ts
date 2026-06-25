import { deriveOutcome } from './markets.js'
import type { CsvRow, EngineeredMatchRecord, MatchOutcome, NormalizedMatchRecord } from './schemas.js'

export interface FeatureEngineeringReport {
  records: EngineeredMatchRecord[]
  rejectedRows: Array<{ index: number; reason: string }>
  detectedColumns: string[]
}

const aliases = {
  league: ['League', 'league', 'Div', 'division'],
  competition: ['Competition', 'competition', 'Comp', 'Tournament', 'tournament'],
  season: ['Season', 'season'],
  date: ['Date', 'date'],
  sourceProvider: ['SourceProvider', 'sourceProvider', 'provider'],
  updatedAt: ['UpdatedAt', 'updatedAt'],
  homeTeam: ['HomeTeam', 'homeTeam', 'Home', 'home_team'],
  awayTeam: ['AwayTeam', 'awayTeam', 'Away', 'away_team'],
  fthg: ['FTHG', 'fullTimeHomeGoals', 'home_goals'],
  ftag: ['FTAG', 'fullTimeAwayGoals', 'away_goals'],
  ftr: ['FTR', 'fullTimeResult', 'result'],
  hc: ['HC', 'homeCorners'],
  ac: ['AC', 'awayCorners'],
  hy: ['HY', 'homeYellowCards'],
  ay: ['AY', 'awayYellowCards'],
  hr: ['HR', 'homeRedCards'],
  ar: ['AR', 'awayRedCards'],
}

export function buildFeatureTable(rows: CsvRow[]): FeatureEngineeringReport {
  const records: EngineeredMatchRecord[] = []
  const rejectedRows: FeatureEngineeringReport['rejectedRows'] = []
  const detectedColumns = rows[0] ? Object.keys(rows[0]) : []

  rows.forEach((row, index) => {
    const normalized = normalizeRow(row, index)

    if (!normalized) {
      rejectedRows.push({ index, reason: 'FTHG/FTAG ausentes ou inválidos' })
      return
    }

    records.push({
      ...normalized,
      totalGoals: normalized.fullTimeHomeGoals + normalized.fullTimeAwayGoals,
      totalCorners:
        normalized.homeCorners !== undefined && normalized.awayCorners !== undefined
          ? normalized.homeCorners + normalized.awayCorners
          : undefined,
      totalCards: totalCards(normalized),
    })
  })

  return { records, rejectedRows, detectedColumns }
}

export function normalizeRow(row: CsvRow, index: number): NormalizedMatchRecord | null {
  const homeGoals = numberFrom(row, aliases.fthg)
  const awayGoals = numberFrom(row, aliases.ftag)

  if (homeGoals === undefined || awayGoals === undefined) return null

  const ftr = stringFrom(row, aliases.ftr)
  const outcome = ftr === 'H' || ftr === 'D' || ftr === 'A' ? ftr : deriveOutcome(homeGoals, awayGoals)

  return {
    index,
    source: row,
    league: stringFrom(row, aliases.league),
    competition: stringFrom(row, aliases.competition),
    season: stringFrom(row, aliases.season),
    date: stringFrom(row, aliases.date),
    sourceProvider: stringFrom(row, aliases.sourceProvider),
    updatedAt: stringFrom(row, aliases.updatedAt),
    homeTeam: stringFrom(row, aliases.homeTeam),
    awayTeam: stringFrom(row, aliases.awayTeam),
    fullTimeHomeGoals: homeGoals,
    fullTimeAwayGoals: awayGoals,
    outcome: outcome as MatchOutcome,
    homeCorners: numberFrom(row, aliases.hc),
    awayCorners: numberFrom(row, aliases.ac),
    homeYellowCards: numberFrom(row, aliases.hy),
    awayYellowCards: numberFrom(row, aliases.ay),
    homeRedCards: numberFrom(row, aliases.hr),
    awayRedCards: numberFrom(row, aliases.ar),
  }
}

function totalCards(record: NormalizedMatchRecord) {
  const cardValues = [
    record.homeYellowCards,
    record.awayYellowCards,
    record.homeRedCards,
    record.awayRedCards,
  ].filter((value): value is number => value !== undefined)

  if (cardValues.length === 0) return undefined

  return cardValues.reduce((sum, value) => sum + value, 0)
}

function stringFrom(row: CsvRow, columns: string[]) {
  for (const column of columns) {
    const value = row[column]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }

  return undefined
}

function numberFrom(row: CsvRow, columns: string[]) {
  const raw = stringFrom(row, columns)
  if (raw === undefined) return undefined

  const parsed = Number(raw.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
