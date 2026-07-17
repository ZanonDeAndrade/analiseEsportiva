import { decisionFromProviderStatus, type MatchDecision } from '../domain/sportsData.js'
import { deriveOutcome } from '../markets.js'
import type { CsvRow, FixtureRecord } from '../schemas.js'

const DEFAULT_BASE_URL = 'https://api.football-data.org/v4'
const PROVIDER = 'football-data-org'

export interface FootballDataOrgCompetitionTarget {
  code: string
  leagueId: string
  name: string
}

export const FOOTBALL_DATA_ORG_TARGETS: readonly FootballDataOrgCompetitionTarget[] = [
  { code: 'BSA', leagueId: 'BRA', name: 'Brasileirao Serie A' },
  { code: 'PL', leagueId: 'PL', name: 'Premier League' },
  { code: 'PD', leagueId: 'LL', name: 'La Liga' },
  { code: 'FL1', leagueId: 'L1', name: 'Ligue 1' },
  { code: 'BL1', leagueId: 'BUN', name: 'Bundesliga' },
] as const

export type FootballDataOrgFetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export interface FootballDataOrgSyncOptions {
  apiKey: string
  from: string
  to: string
  targets?: readonly FootballDataOrgCompetitionTarget[]
  baseUrl?: string
  fetcher?: FootballDataOrgFetchLike
  signal?: AbortSignal
}

export interface FootballDataOrgSyncResult {
  rows: CsvRow[]
  fixtures: FixtureRecord[]
  updatedAt: string
  warnings: string[]
}

export interface FootballDataOrgHistoryOptions {
  apiKey: string
  target: FootballDataOrgCompetitionTarget
  season: number
  baseUrl?: string
  fetcher?: FootballDataOrgFetchLike
  signal?: AbortSignal
}

interface FootballDataOrgResponse {
  matches?: FootballDataOrgMatch[]
  message?: string
  errorCode?: number
}

interface FootballDataOrgMatch {
  id?: number
  utcDate?: string
  status?: string
  lastUpdated?: string
  matchday?: number
  stage?: string
  competition?: { id?: number; code?: string; name?: string }
  season?: { id?: number; startDate?: string; endDate?: string }
  homeTeam?: { id?: number; name?: string; shortName?: string }
  awayTeam?: { id?: number; name?: string; shortName?: string }
  score?: {
    winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | string
    fullTime?: FootballDataOrgScore
    regularTime?: FootballDataOrgScore
    extraTime?: FootballDataOrgScore
    penalties?: FootballDataOrgScore
  }
}

interface FootballDataOrgScore {
  home?: number | null
  away?: number | null
}

/**
 * Adaptador da API football-data.org v4. Uma unica chamada cobre as ligas alvo,
 * reduzindo consumo de cota e mantendo o dominio independente do payload externo.
 */
export async function fetchFootballDataOrgFixtures(
  options: FootballDataOrgSyncOptions,
): Promise<FootballDataOrgSyncResult> {
  const targets = options.targets ?? FOOTBALL_DATA_ORG_TARGETS
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetcher = options.fetcher ?? fetch
  const updatedAt = new Date().toISOString()
  const targetByCode = new Map(targets.map((target) => [target.code, target]))
  const url = new URL('/v4/matches', baseUrl)
  url.searchParams.set('competitions', targets.map((target) => target.code).join(','))
  url.searchParams.set('dateFrom', options.from)
  url.searchParams.set('dateTo', options.to)

  const response = await fetcher(url.toString(), {
    headers: { 'X-Auth-Token': options.apiKey },
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`football-data.org retornou HTTP ${response.status}`)
  }

  const payload = (await response.json()) as FootballDataOrgResponse
  if (payload.errorCode || payload.message && !Array.isArray(payload.matches)) {
    throw new Error(payload.message?.trim() || `football-data.org retornou erro ${payload.errorCode}`)
  }

  const rows: CsvRow[] = []
  const fixtures: FixtureRecord[] = []
  const warnings: string[] = []

  for (const match of payload.matches ?? []) {
    const code = match.competition?.code?.trim()
    const target = code ? targetByCode.get(code) : undefined
    if (!target) {
      warnings.push(`Partida ${match.id ?? 'sem-id'} ignorada: competicao fora da configuracao.`)
      continue
    }

    const completed = mapCompletedMatch(match, target, updatedAt)
    if (completed) rows.push(completed)
    else fixtures.push(mapFixture(match, target, updatedAt))
  }

  return {
    rows: dedupeRows(rows),
    fixtures: dedupeFixtures(fixtures),
    updatedAt,
    warnings,
  }
}

/**
 * Carrega resultados encerrados de uma temporada para formar segmentos de
 * treino rastreáveis. A consulta é separada da agenda futura para não misturar
 * partidas ainda não iniciadas com observações históricas.
 */
export async function fetchFootballDataOrgHistory(
  options: FootballDataOrgHistoryOptions,
): Promise<FootballDataOrgSyncResult> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const fetcher = options.fetcher ?? fetch
  const updatedAt = new Date().toISOString()
  const url = new URL(`/v4/competitions/${encodeURIComponent(options.target.code)}/matches`, baseUrl)
  url.searchParams.set('season', String(options.season))
  url.searchParams.set('status', 'FINISHED')

  const response = await fetcher(url.toString(), {
    headers: { 'X-Auth-Token': options.apiKey },
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`football-data.org retornou HTTP ${response.status} ao consultar historico`)
  }

  const payload = (await response.json()) as FootballDataOrgResponse
  if (payload.errorCode || payload.message && !Array.isArray(payload.matches)) {
    throw new Error(payload.message?.trim() || `football-data.org retornou erro ${payload.errorCode}`)
  }

  const rows: CsvRow[] = []
  const warnings: string[] = []
  for (const match of payload.matches ?? []) {
    const completed = mapCompletedMatch(match, options.target, updatedAt)
    if (completed) rows.push(completed)
    else warnings.push(`Partida historica ${match.id ?? 'sem-id'} ignorada: resultado final ausente.`)
  }

  return {
    rows: dedupeRows(rows),
    fixtures: [],
    updatedAt,
    warnings,
  }
}

export function mapFootballDataOrgMatch(
  match: FootballDataOrgMatch,
  target: FootballDataOrgCompetitionTarget,
  updatedAt = new Date().toISOString(),
) {
  return {
    row: mapCompletedMatch(match, target, updatedAt),
    fixture: mapFixture(match, target, updatedAt),
  }
}

function mapCompletedMatch(
  match: FootballDataOrgMatch,
  target: FootballDataOrgCompetitionTarget,
  updatedAt: string,
): CsvRow | null {
  if (match.status !== 'FINISHED' && match.status !== 'AWARDED') return null

  const score = regulationScore(match)
  if (!hasScore(score)) return null
  const decision = resultDecision(match)

  return {
    Div: target.code,
    League: match.competition?.name?.trim() || target.name,
    Competition: target.name,
    Season: seasonLabel(match),
    Date: requiredUtcDate(match),
    HomeTeam: teamName(match.homeTeam, 'Mandante nao identificado'),
    AwayTeam: teamName(match.awayTeam, 'Visitante nao identificado'),
    HomeTeamExternalId: optionalIdentifier(match.homeTeam?.id),
    AwayTeamExternalId: optionalIdentifier(match.awayTeam?.id),
    FTHG: String(score.home),
    FTAG: String(score.away),
    FTR: deriveOutcome(score.home, score.away),
    SourceProvider: PROVIDER,
    ExternalFixtureId: optionalIdentifier(match.id),
    RawStatus: match.status,
    ResultDecision: decision,
    HomeExtraTimeGoals: optionalScore(match.score?.extraTime?.home),
    AwayExtraTimeGoals: optionalScore(match.score?.extraTime?.away),
    HomePenaltyGoals: optionalScore(match.score?.penalties?.home),
    AwayPenaltyGoals: optionalScore(match.score?.penalties?.away),
    UpdatedAt: updatedAt,
  }
}

function mapFixture(
  match: FootballDataOrgMatch,
  target: FootballDataOrgCompetitionTarget,
  updatedAt: string,
): FixtureRecord {
  const isoDate = requiredUtcDate(match)
  const date = new Date(isoDate)
  const externalId = match.id
  const league = match.competition?.name?.trim() || target.name

  return {
    id: externalId === undefined ? `${PROVIDER}-${target.code}-${isoDate}` : `${PROVIDER}-${externalId}`,
    fixtureId: externalId,
    competition: target.name,
    leagueId: target.leagueId,
    league,
    season: seasonLabel(match),
    round: match.matchday === undefined ? match.stage : `Rodada ${match.matchday}`,
    date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }),
    time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
    isoDate,
    status: match.status?.trim() || 'SCHEDULED',
    homeTeam: teamName(match.homeTeam, 'Mandante nao identificado'),
    awayTeam: teamName(match.awayTeam, 'Visitante nao identificado'),
    homeTeamExternalId: optionalIdentifier(match.homeTeam?.id),
    awayTeamExternalId: optionalIdentifier(match.awayTeam?.id),
    sourceProvider: PROVIDER,
    updatedAt,
  }
}

function regulationScore(match: FootballDataOrgMatch): { home: number; away: number } | undefined {
  const score = match.score?.regularTime ?? match.score?.fullTime
  if (!hasScore(score)) return undefined
  return { home: score.home, away: score.away }
}

function resultDecision(match: FootballDataOrgMatch): MatchDecision {
  if (match.status === 'AWARDED') return 'administrative'
  if (hasScore(match.score?.penalties) || match.score?.duration === 'PENALTY_SHOOTOUT') return 'penalties'
  if (hasScore(match.score?.extraTime) || match.score?.duration === 'EXTRA_TIME') return 'extra_time'
  return decisionFromProviderStatus(match.status ?? 'FINISHED')
}

function seasonLabel(match: FootballDataOrgMatch) {
  const start = match.season?.startDate?.slice(0, 4)
  const end = match.season?.endDate?.slice(0, 4)
  if (!start) return ''
  return end && end !== start ? `${start}/${end}` : start
}

function requiredUtcDate(match: FootballDataOrgMatch) {
  const value = match.utcDate?.trim()
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Partida ${match.id ?? 'sem-id'} sem utcDate valida.`)
  }
  return new Date(value).toISOString()
}

function teamName(team: FootballDataOrgMatch['homeTeam'], fallback: string) {
  return team?.name?.trim() || team?.shortName?.trim() || fallback
}

function hasScore(score: FootballDataOrgScore | undefined): score is { home: number; away: number } {
  return Number.isInteger(score?.home) && Number.isInteger(score?.away)
}

function optionalScore(value: number | null | undefined) {
  return Number.isInteger(value) ? String(value) : undefined
}

function optionalIdentifier(value: number | undefined) {
  return value === undefined ? undefined : String(value)
}

function dedupeFixtures(fixtures: FixtureRecord[]) {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]))
  return [...byId.values()].sort((left, right) => left.isoDate.localeCompare(right.isoDate))
}

function dedupeRows(rows: CsvRow[]) {
  const byId = new Map(rows.map((row) => [row.ExternalFixtureId, row]))
  return [...byId.values()]
}
