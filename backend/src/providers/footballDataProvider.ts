import { parseCsv } from '../csv.js'
import type { CsvRow } from '../schemas.js'

export interface FootballDataContext {
  league?: string
  season?: string
  sourceUrl?: string
}

export interface FootballDataFetchOptions extends FootballDataContext {
  url: string
  fetcher?: FootballDataFetchLike
}

export type FootballDataFetchLike = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

const RESULT_COLUMNS = new Set([
  'Div',
  'Date',
  'Time',
  'HomeTeam',
  'AwayTeam',
  'FTHG',
  'FTAG',
  'FTR',
  'HC',
  'AC',
  'HY',
  'AY',
  'HR',
  'AR',
])

const FOOTBALL_DATA_LEAGUES = [
  { league: 'Premier League', code: 'E0' },
  { league: 'La Liga', code: 'SP1' },
  { league: 'Bundesliga', code: 'D1' },
] as const

/** Gera fontes historicas por janela; nao existe calendario ficticio embutido. */
export function buildFootballDataSources(years = 5, now = new Date()) {
  const currentStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return Array.from({ length: Math.max(1, Math.min(10, years)) }, (_, offset) => currentStartYear - offset)
    .flatMap((startYear) => FOOTBALL_DATA_LEAGUES.map(({ league, code }) => {
      const endYear = startYear + 1
      const pathSeason = `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`
      return {
        league,
        season: `${startYear}-${endYear}`,
        url: `https://www.football-data.co.uk/mmz4281/${pathSeason}/${code}.csv`,
      }
    }))
}

export async function fetchFootballDataCsv(options: FootballDataFetchOptions): Promise<CsvRow[]> {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(options.url)

  if (!response.ok) {
    throw new Error(`Football-Data retornou HTTP ${response.status} para ${options.url}`)
  }

  return parseFootballDataCsv(await response.text(), options)
}

export function parseFootballDataCsv(content: string, context: FootballDataContext = {}): CsvRow[] {
  return parseCsv(content)
    .filter((row) => row.FTHG !== undefined && row.FTHG !== '' && row.FTAG !== undefined && row.FTAG !== '')
    .map((row) => normalizeFootballDataRow(row, context))
}

function normalizeFootballDataRow(row: CsvRow, context: FootballDataContext): CsvRow {
  const normalized: CsvRow = {}

  for (const column of RESULT_COLUMNS) {
    if (row[column] !== undefined) normalized[column] = row[column]
  }

  normalized.League = context.league ?? row.Div ?? 'Football-Data'
  normalized.Competition = context.league ?? row.Div ?? 'Football-Data'
  normalized.Season = context.season
  normalized.SourceProvider = 'football-data.co.uk'
  normalized.SourceUrl = context.sourceUrl
  normalized.UpdatedAt = new Date().toISOString()

  return normalized
}
