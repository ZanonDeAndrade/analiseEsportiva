import { deriveOutcome } from './markets.js'
import type { CsvRow, EngineeredMatchRecord, MatchOutcome, NormalizedMatchRecord } from './schemas.js'
import {
  describeScoreRejection,
  validateGoalScore,
  type ScoreRejectionCode,
} from './scoreValidation.js'

/** Linha descartada com motivo estruturado (codigo + campo + valor recebido). */
export interface RejectedRow {
  index: number
  reason: string
  code: ScoreRejectionCode
  field: string
  value: string
}

export type RowNormalization =
  | { ok: true; record: NormalizedMatchRecord }
  | { ok: false; rejection: RejectedRow }

export interface FeatureEngineeringReport {
  records: EngineeredMatchRecord[]
  rejectedRows: RejectedRow[]
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
    const result = normalizeRow(row, index)

    if (!result.ok) {
      rejectedRows.push(result.rejection)
      return
    }

    const normalized = result.record
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

export function normalizeRow(row: CsvRow, index: number): RowNormalization {
  // Validacao centralizada de placares: uma linha invalida nunca entra no dataset.
  const home = validateGoalScore(stringFrom(row, aliases.fthg), 'FTHG', 'home')
  if (!home.ok) return { ok: false, rejection: rejectRow(index, home.rejection) }

  const away = validateGoalScore(stringFrom(row, aliases.ftag), 'FTAG', 'away')
  if (!away.ok) return { ok: false, rejection: rejectRow(index, away.rejection) }

  const homeGoals = home.value
  const awayGoals = away.value
  const ftr = stringFrom(row, aliases.ftr)
  const outcome = ftr === 'H' || ftr === 'D' || ftr === 'A' ? ftr : deriveOutcome(homeGoals, awayGoals)

  return {
    ok: true,
    record: {
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
    },
  }
}

function rejectRow(index: number, rejection: { code: ScoreRejectionCode; field: string; value: string }): RejectedRow {
  return {
    index,
    reason: describeScoreRejection(rejection),
    code: rejection.code,
    field: rejection.field,
    value: rejection.value,
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
