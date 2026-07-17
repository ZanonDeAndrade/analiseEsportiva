import { deriveOutcome } from '../markets.js'
import type { CsvRow, FixtureRecord } from '../schemas.js'
import { decisionFromProviderStatus } from '../domain/sportsData.js'

const DEFAULT_BASE_URL = 'https://v3.football.api-sports.io'

export interface ApiFootballCompetitionTarget {
  league: number
  season: number
  leagueId: string
  name: string
}

export function buildApiFootballFixtureTargets(now = new Date()): ApiFootballCompetitionTarget[] {
  const year = now.getUTCFullYear()
  const europeanSeason = now.getUTCMonth() >= 6 ? year : year - 1
  return [
    { league: 71, season: year, leagueId: 'BRA', name: 'Brasileirao Serie A' },
    { league: 39, season: europeanSeason, leagueId: 'PL', name: 'Premier League' },
    { league: 140, season: europeanSeason, leagueId: 'LL', name: 'La Liga' },
    { league: 61, season: europeanSeason, leagueId: 'L1', name: 'Ligue 1' },
    { league: 78, season: europeanSeason, leagueId: 'BUN', name: 'Bundesliga' },
  ]
}

export interface ApiFootballSyncOptions {
  apiKey: string
  league?: number
  season?: number
  from?: string
  to?: string
  years?: number
  baseUrl?: string
  fetcher?: ApiFootballFetchLike
}

export interface ApiFootballSyncResult {
  rows: CsvRow[]
  fixtures: FixtureRecord[]
  updatedAt: string
  warnings: string[]
}

export type ApiFootballFetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string> }>

interface ApiFootballResponse {
  response?: ApiFootballFixture[]
  errors?: unknown
}

interface ApiFootballFixture {
  fixture?: {
    id?: number
    date?: string
    status?: { short?: string; long?: string }
  }
  league?: {
    id?: number
    name?: string
    season?: number
    round?: string
  }
  teams?: {
    home?: { id?: number; name?: string }
    away?: { id?: number; name?: string }
  }
  goals?: {
    home?: number | null
    away?: number | null
  }
  score?: {
    extratime?: { home?: number | null; away?: number | null }
    penalty?: { home?: number | null; away?: number | null }
  }
  events?: Array<{
    type?: string
    detail?: string
    team?: { id?: number }
  }>
  statistics?: Array<{
    team?: { id?: number }
    statistics?: Array<{ type?: string; value?: number | string | null }>
  }>
}

export async function fetchApiFootballTargetFixtures(
  options: Omit<ApiFootballSyncOptions, 'league' | 'season'> & {
    targets?: ApiFootballCompetitionTarget[]
  },
): Promise<ApiFootballSyncResult> {
  const targets = options.targets ?? buildApiFootballFixtureTargets()
  const results: ApiFootballSyncResult[] = []
  const warnings: string[] = []

  for (const target of targets) {
    try {
      results.push(
        await fetchApiFootballFixtures({
          ...options,
          league: target.league,
          season: target.season,
          from: options.from ?? todayDateParam(),
          to: options.to ?? rollingEndDate(),
          leagueId: target.leagueId,
          competitionName: target.name,
        }),
      )
    } catch (error) {
      warnings.push(`${target.name} ${target.season}: ${message(error)}`)
    }
  }

  return combineResults(results, warnings, true)
}

export async function fetchApiFootballHistoricalResults(
  options: Omit<ApiFootballSyncOptions, 'league' | 'season'> & {
    targets?: ApiFootballCompetitionTarget[]
  },
): Promise<ApiFootballSyncResult> {
  const years = normalizeHistoryYears(options.years)
  const range = historyDateRange(years)
  const result = await fetchApiFootballTargetFixtures({
    ...options,
    from: options.from ?? range.from,
    to: options.to ?? range.to,
    targets: options.targets ?? buildApiFootballHistoricalTargets(years),
  })

  return {
    ...result,
    fixtures: [],
  }
}

export function buildApiFootballHistoricalTargets(
  years = 5,
  now = new Date(),
): ApiFootballCompetitionTarget[] {
  const currentYear = now.getUTCFullYear()
  const startYear = currentYear - normalizeHistoryYears(years)
  const leagueTargets = buildApiFootballFixtureTargets(now)
  const targets: ApiFootballCompetitionTarget[] = []

  for (const target of leagueTargets) {
    for (let season = startYear; season <= currentYear; season += 1) {
      targets.push({ ...target, season })
    }
  }

  return targets
}

export function historyDateRange(years = 5, now = new Date()) {
  const fromDate = new Date(now)
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - normalizeHistoryYears(years))

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

async function fetchApiFootballFixtures(
  options: ApiFootballSyncOptions & {
    league: number
    season: number
    leagueId?: string
    competitionName?: string
  },
): Promise<ApiFootballSyncResult> {
  const { league, season } = options
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetcher = options.fetcher ?? fetch
  const updatedAt = new Date().toISOString()
  const url = new URL('/fixtures', baseUrl)
  url.searchParams.set('league', String(league))
  url.searchParams.set('season', String(season))
  if (options.from) url.searchParams.set('from', options.from)
  if (options.to) url.searchParams.set('to', options.to)

  // Throttle/retry apenas no fetch real (testes injetam fetcher e nao devem esperar).
  const useThrottle = !options.fetcher
  const response = await rateLimitedFetch(
    fetcher,
    url.toString(),
    { headers: { 'x-apisports-key': options.apiKey } },
    useThrottle,
  )

  if (!response.ok) {
    throw new Error(`API-Football retornou HTTP ${response.status}`)
  }

  const payload = (await response.json()) as ApiFootballResponse
  const apiErrors = extractApiErrors(payload.errors)
  if (apiErrors.length > 0) {
    throw new Error(apiErrors.join('; '))
  }

  const fixtures = payload.response ?? []

  return {
    rows: fixtures
      .map((fixture) => mapApiFootballFixture(fixture, updatedAt, options.competitionName))
      .filter(isCompletedRow),
    fixtures: fixtures.map((fixture) =>
      mapApiFootballFixtureRecord(fixture, updatedAt, options.leagueId, options.competitionName),
    ),
    updatedAt,
    warnings: [],
  }
}

export function mapApiFootballFixture(
  fixture: ApiFootballFixture,
  updatedAt = new Date().toISOString(),
  competitionName?: string,
): CsvRow {
  const homeGoals = fixture.goals?.home
  const awayGoals = fixture.goals?.away
  const cards = extractCards(fixture)
  const corners = extractCorners(fixture)
  const homeTeam = fixture.teams?.home?.name ?? 'Mandante'
  const awayTeam = fixture.teams?.away?.name ?? 'Visitante'
  const leagueName = fixture.league?.name ?? 'Competicao desconhecida'
  const season = fixture.league?.season === undefined ? '' : String(fixture.league.season)
  const competition = competitionName ?? leagueName
  const rawStatus = fixture.fixture?.status?.short ?? 'FT'
  const decision = decisionFromProviderStatus(rawStatus)

  return {
    Div: fixture.league?.id ? String(fixture.league.id) : 'api',
    League: leagueName,
    Competition: competition,
    Season: season,
    Date: fixture.fixture?.date?.slice(0, 10) ?? '',
    HomeTeam: homeTeam,
    AwayTeam: awayTeam,
    HomeTeamExternalId: fixture.teams?.home?.id === undefined ? undefined : String(fixture.teams.home.id),
    AwayTeamExternalId: fixture.teams?.away?.id === undefined ? undefined : String(fixture.teams.away.id),
    FTHG: homeGoals === null || homeGoals === undefined ? undefined : String(homeGoals),
    FTAG: awayGoals === null || awayGoals === undefined ? undefined : String(awayGoals),
    FTR:
      homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined
        ? undefined
        : deriveOutcome(homeGoals, awayGoals),
    HC: corners.home === undefined ? undefined : String(corners.home),
    AC: corners.away === undefined ? undefined : String(corners.away),
    HY: cards.homeYellow === undefined ? undefined : String(cards.homeYellow),
    AY: cards.awayYellow === undefined ? undefined : String(cards.awayYellow),
    HR: cards.homeRed === undefined ? undefined : String(cards.homeRed),
    AR: cards.awayRed === undefined ? undefined : String(cards.awayRed),
    SourceProvider: 'api-football',
    ExternalFixtureId: fixture.fixture?.id === undefined ? undefined : String(fixture.fixture.id),
    RawStatus: rawStatus,
    ResultDecision: decision,
    HomeExtraTimeGoals: optionalScore(fixture.score?.extratime?.home),
    AwayExtraTimeGoals: optionalScore(fixture.score?.extratime?.away),
    HomePenaltyGoals: optionalScore(fixture.score?.penalty?.home),
    AwayPenaltyGoals: optionalScore(fixture.score?.penalty?.away),
    UpdatedAt: updatedAt,
  }
}

export function mapApiFootballFixtureRecord(
  fixture: ApiFootballFixture,
  updatedAt = new Date().toISOString(),
  leagueId?: string,
  competitionName?: string,
): FixtureRecord {
  const isoDate = fixture.fixture?.date ?? new Date().toISOString()
  const date = new Date(isoDate)
  const season = fixture.league?.season === undefined ? '' : String(fixture.league.season)
  const leagueName = fixture.league?.name ?? 'Competicao desconhecida'
  const competition = competitionName ?? leagueName

  return {
    id: fixture.fixture?.id ? `api-football-${fixture.fixture.id}` : `${competition}-${isoDate}`,
    fixtureId: fixture.fixture?.id,
    competition,
    leagueId: leagueId ?? String(fixture.league?.id ?? 'api'),
    league: leagueName,
    season,
    round: fixture.league?.round,
    date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    isoDate,
    status: fixture.fixture?.status?.short ?? 'NS',
    homeTeam: fixture.teams?.home?.name ?? 'Mandante',
    awayTeam: fixture.teams?.away?.name ?? 'Visitante',
    sourceProvider: 'api-football',
    updatedAt,
  }
}

function combineResults(results: ApiFootballSyncResult[], warnings: string[], includeFixtures: boolean) {
  return {
    rows: dedupeRows(results.flatMap((result) => result.rows)),
    fixtures: includeFixtures ? dedupeFixtures(results.flatMap((result) => result.fixtures)) : [],
    updatedAt: new Date().toISOString(),
    warnings: [...warnings, ...results.flatMap((result) => result.warnings)],
  }
}

function extractCards(fixture: ApiFootballFixture) {
  const homeId = fixture.teams?.home?.id
  const awayId = fixture.teams?.away?.id
  let homeYellow = 0
  let awayYellow = 0
  let homeRed = 0
  let awayRed = 0
  let sawCard = false

  for (const event of fixture.events ?? []) {
    if (event.type !== 'Card') continue
    sawCard = true

    const detail = event.detail?.toLowerCase() ?? ''
    const isHome = event.team?.id === homeId
    const isAway = event.team?.id === awayId

    if (detail.includes('red')) {
      if (isHome) homeRed += 1
      if (isAway) awayRed += 1
      continue
    }

    if (detail.includes('yellow')) {
      if (isHome) homeYellow += 1
      if (isAway) awayYellow += 1
    }
  }

  return {
    homeYellow: sawCard ? homeYellow : undefined,
    awayYellow: sawCard ? awayYellow : undefined,
    homeRed: sawCard ? homeRed : undefined,
    awayRed: sawCard ? awayRed : undefined,
  }
}

function extractCorners(fixture: ApiFootballFixture) {
  const homeId = fixture.teams?.home?.id
  const awayId = fixture.teams?.away?.id
  let home: number | undefined
  let away: number | undefined

  for (const teamStats of fixture.statistics ?? []) {
    const cornerStat = teamStats.statistics?.find((stat) => stat.type === 'Corner Kicks')
    const value = numericValue(cornerStat?.value)

    if (value === undefined) continue
    if (teamStats.team?.id === homeId) home = value
    if (teamStats.team?.id === awayId) away = value
  }

  return { home, away }
}

function numericValue(value: number | string | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

function optionalScore(value: number | null | undefined) {
  return value === null || value === undefined ? undefined : String(value)
}

function isCompletedRow(row: CsvRow) {
  return row.FTHG !== undefined && row.FTAG !== undefined
}

// Throttle para respeitar o limite por minuto do plano gratuito (~10 req/min).
const REQUEST_GAP_MS = Number(process.env.BETINTEL_API_MIN_GAP_MS ?? 6500)
const RATE_LIMIT_WAIT_MS = Number(process.env.BETINTEL_API_RATE_WAIT_MS ?? 65000)
const MAX_RATE_RETRIES = 2
let lastRequestAt = 0

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Faz a requisicao respeitando um intervalo minimo entre chamadas e tentando
 * novamente quando a API responde HTTP 429 (limite por minuto). As chamadas do
 * sync sao sequenciais, entao um simples controle de tempo global e suficiente.
 */
async function rateLimitedFetch(
  fetcher: ApiFootballFetchLike,
  url: string,
  init: { headers?: Record<string, string> },
  useThrottle: boolean,
): Promise<Awaited<ReturnType<ApiFootballFetchLike>>> {
  if (!useThrottle) return fetcher(url, init)

  const gap = lastRequestAt + REQUEST_GAP_MS - Date.now()
  if (gap > 0) await sleep(gap)

  let response = await fetcher(url, init)

  for (let attempt = 0; response.status === 429 && attempt < MAX_RATE_RETRIES; attempt += 1) {
    await sleep(RATE_LIMIT_WAIT_MS)
    response = await fetcher(url, init)
  }

  lastRequestAt = Date.now()
  return response
}

function extractApiErrors(errors: unknown): string[] {
  if (!errors) return []
  if (Array.isArray(errors)) return errors.filter(Boolean).map((value) => String(value))
  if (typeof errors === 'object') {
    return Object.values(errors as Record<string, unknown>)
      .filter(Boolean)
      .map((value) => String(value))
  }
  if (typeof errors === 'string' && errors.trim()) return [errors]
  return []
}

function todayDateParam() {
  return new Date().toISOString().slice(0, 10)
}

function rollingEndDate(now = new Date()) {
  const end = new Date(now)
  end.setUTCDate(end.getUTCDate() + 366)
  return end.toISOString().slice(0, 10)
}

function dedupeFixtures(fixtures: FixtureRecord[]) {
  const map = new Map<string, FixtureRecord>()
  for (const fixture of fixtures) map.set(fixture.id, fixture)
  return [...map.values()].sort((left, right) => left.isoDate.localeCompare(right.isoDate))
}

function dedupeRows(rows: CsvRow[]) {
  const map = new Map<string, CsvRow>()
  for (const row of rows) {
    const key = `${row.Date ?? ''}-${row.HomeTeam ?? ''}-${row.AwayTeam ?? ''}-${row.Competition ?? ''}`
    map.set(key, row)
  }
  return [...map.values()]
}

function normalizeHistoryYears(years: number | undefined) {
  if (!years || !Number.isFinite(years) || years < 1) return 5
  return Math.min(10, Math.floor(years))
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'erro desconhecido'
}
