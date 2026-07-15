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

export const defaultFootballDataSources = [
  {
    league: 'Premier League',
    season: '2025-2026',
    url: 'https://www.football-data.co.uk/mmz4281/2526/E0.csv',
  },
  {
    league: 'La Liga',
    season: '2025-2026',
    url: 'https://www.football-data.co.uk/mmz4281/2526/SP1.csv',
  },
  {
    league: 'Bundesliga',
    season: '2025-2026',
    url: 'https://www.football-data.co.uk/mmz4281/2526/D1.csv',
  },
]

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
