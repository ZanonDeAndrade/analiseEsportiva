import { canonicalDate, compareCanonical } from './dataQuality.js'
import { teamKey } from './teamNames.js'
import type { EngineeredMatchRecord, MatchOutcome } from './schemas.js'

/**
 * ETAPA 3 + 5 — Gerador SEQUENCIAL de features pré-jogo, modular, versionado e
 * sem vazamento temporal.
 *
 * Para cada partida, em ordem cronológica determinística:
 *   1. lê o estado histórico ANTERIOR (somente partidas já processadas);
 *   2. gera as features pré-jogo a partir desse estado;
 *   3. armazena o exemplo;
 *   4. só DEPOIS atualiza o estado com o resultado da partida.
 *
 * Nenhuma feature usa informação indisponível no momento real da previsão, e
 * alterar o resultado de uma partida futura não muda features de partidas
 * anteriores (garantido por construção e por teste obrigatório).
 */

export const PRE_MATCH_FEATURE_SET_VERSION = 'pre-match-v2-windows-elo-recency'

export const ELO_START = 1500
export const ELO_K = 20
export const ELO_HOME_ADVANTAGE = 60
const DEFAULT_RECENCY_LAMBDA = 0.02 // por dia (meia-vida ~35 dias)
const HISTORY_CAP = 20

export interface WindowForm {
  sampleSize: number
  wins: number
  draws: number
  losses: number
  pointsPerGame: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  avgGoalsFor: number
  avgGoalsAgainst: number
  over15Pct: number
  over25Pct: number
  over35Pct: number
  bttsPct: number
  cleanSheetPct: number
  failedToScorePct: number
}

export interface TeamFeatures {
  played: number
  hasHistory: boolean
  eloBefore: number
  eloRecentChange: number
  restDays: number | null
  games7: number
  games14: number
  venueStreak: number
  recentOpponentElo: number | null
  form5: WindowForm
  form10: WindowForm
  form20: WindowForm
  venueForm10: WindowForm
  expWeightedGoalsFor: number
  expWeightedGoalsAgainst: number
  expWeightedPoints: number
}

export interface AvailabilityFlags {
  corners: boolean
  cards: boolean
  xg: boolean
  shots: boolean
  possession: boolean
}

export interface PreMatchFeatures {
  competition: string
  season: string | null
  round: string | null
  month: number
  homeAdvantage: 1
  home: TeamFeatures
  away: TeamFeatures
  eloDiff: number
  homeAdvantageAdjustedElo: number
  h2hMatches: number
  h2hHomeWinRate: number | null
  h2hRecencyDays: number | null
  h2hSeasonChanged: boolean
  availability: AvailabilityFlags
  // Campos planos preservados para consumidores diretos (logística / boosting).
  homePlayed: number
  awayPlayed: number
  homeHasHistory: boolean
  awayHasHistory: boolean
  homeEloBefore: number
  awayEloBefore: number
  homeFormPoints: number
  awayFormPoints: number
  homeGoalsForAvg: number
  homeGoalsAgainstAvg: number
  awayGoalsForAvg: number
  awayGoalsAgainstAvg: number
  homeRestDays: number | null
  awayRestDays: number | null
  h2hMatchesFlat: number
}

export interface FeatureExample {
  index: number
  date: string
  competition: string
  season?: string
  homeTeam: string
  awayTeam: string
  features: PreMatchFeatures
  label: {
    outcome: MatchOutcome
    homeGoals: number
    awayGoals: number
    totalGoals: number
    bothTeamsScored: boolean
  }
  record: EngineeredMatchRecord
}

export interface FeatureGenerationOptions {
  /** Lambda da ponderação exponencial por recência (por dia). Selecionar só na validação. */
  recencyLambda?: number
}

interface MatchSummary {
  points: number
  goalsFor: number
  goalsAgainst: number
  totalOver15: boolean
  totalOver25: boolean
  totalOver35: boolean
  btts: boolean
  timestamp: number | null
  opponentElo: number
}

interface TeamState {
  played: number
  elo: number
  eloHistory: number[]
  recent: MatchSummary[]
  recentAtVenue: { home: MatchSummary[]; away: MatchSummary[] }
  matchDates: number[]
  lastTimestamp: number | null
  lastVenue: 'home' | 'away' | null
  venueStreak: number
}

interface H2HState {
  meetings: number
  firstKeyWins: number
  secondKeyWins: number
  draws: number
  lastTimestamp: number | null
  lastSeason: string | null
}

function initialTeamState(): TeamState {
  return {
    played: 0,
    elo: ELO_START,
    eloHistory: [],
    recent: [],
    recentAtVenue: { home: [], away: [] },
    matchDates: [],
    lastTimestamp: null,
    lastVenue: null,
    venueStreak: 0,
  }
}

export function generateSequentialFeatures(
  records: EngineeredMatchRecord[],
  options: FeatureGenerationOptions = {},
): FeatureExample[] {
  const lambda = options.recencyLambda ?? DEFAULT_RECENCY_LAMBDA
  const ordered = [...records].sort(compareCanonical)
  const teams = new Map<string, TeamState>()
  const headToHead = new Map<string, H2HState>()
  const examples: FeatureExample[] = []

  for (const record of ordered) {
    if (!record.homeTeam || !record.awayTeam || !record.date) continue
    const timestamp = canonicalDate(record.date)?.timestamp ?? null
    const homeKey = teamKey(record.homeTeam)
    const awayKey = teamKey(record.awayTeam)
    const homeState = teams.get(homeKey) ?? initialTeamState()
    const awayState = teams.get(awayKey) ?? initialTeamState()
    const h2hKey = pairKey(homeKey, awayKey)
    const h2h = headToHead.get(h2hKey)

    const homeFeatures = teamFeatures(homeState, 'home', timestamp, lambda)
    const awayFeatures = teamFeatures(awayState, 'away', timestamp, lambda)

    const features: PreMatchFeatures = {
      competition: record.competition ?? record.league ?? 'sem-competicao',
      season: record.season ?? null,
      round: record.source?.Round ?? record.source?.round ?? null,
      month: timestamp ? new Date(timestamp).getUTCMonth() + 1 : 0,
      homeAdvantage: 1,
      home: homeFeatures,
      away: awayFeatures,
      eloDiff: round(homeState.elo - awayState.elo),
      homeAdvantageAdjustedElo: round(homeState.elo + ELO_HOME_ADVANTAGE - awayState.elo),
      h2hMatches: h2h?.meetings ?? 0,
      h2hHomeWinRate: h2hHomeWinRate(h2h, homeKey, awayKey),
      h2hRecencyDays: h2h?.lastTimestamp && timestamp ? Math.round((timestamp - h2h.lastTimestamp) / 86_400_000) : null,
      h2hSeasonChanged: Boolean(h2h && h2h.lastSeason !== (record.season ?? null)),
      availability: availabilityFor(record),
      homePlayed: homeFeatures.played,
      awayPlayed: awayFeatures.played,
      homeHasHistory: homeFeatures.hasHistory,
      awayHasHistory: awayFeatures.hasHistory,
      homeEloBefore: homeFeatures.eloBefore,
      awayEloBefore: awayFeatures.eloBefore,
      homeFormPoints: homeFeatures.form5.pointsPerGame,
      awayFormPoints: awayFeatures.form5.pointsPerGame,
      homeGoalsForAvg: homeFeatures.form5.avgGoalsFor,
      homeGoalsAgainstAvg: homeFeatures.form5.avgGoalsAgainst,
      awayGoalsForAvg: awayFeatures.form5.avgGoalsFor,
      awayGoalsAgainstAvg: awayFeatures.form5.avgGoalsAgainst,
      homeRestDays: homeFeatures.restDays,
      awayRestDays: awayFeatures.restDays,
      h2hMatchesFlat: h2h?.meetings ?? 0,
    }

    examples.push({
      index: record.index,
      date: record.date,
      competition: features.competition,
      season: record.season,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      features,
      label: {
        outcome: record.outcome,
        homeGoals: record.fullTimeHomeGoals,
        awayGoals: record.fullTimeAwayGoals,
        totalGoals: record.totalGoals,
        bothTeamsScored: record.fullTimeHomeGoals > 0 && record.fullTimeAwayGoals > 0,
      },
      record,
    })

    // Passo 4: atualiza o estado com o resultado, capturando o Elo anterior.
    const homeEloBefore = homeState.elo
    const awayEloBefore = awayState.elo
    updateTeam(homeState, record, 'home', timestamp, awayEloBefore)
    updateTeam(awayState, record, 'away', timestamp, homeEloBefore)
    applyElo(homeState, awayState, record, homeEloBefore, awayEloBefore)
    teams.set(homeKey, homeState)
    teams.set(awayKey, awayState)
    headToHead.set(h2hKey, updateH2H(h2h, homeKey, awayKey, record.outcome, timestamp, record.season ?? null))
  }

  return examples
}

function teamFeatures(state: TeamState, side: 'home' | 'away', timestamp: number | null, lambda: number): TeamFeatures {
  const venue = state.recentAtVenue[side]
  return {
    played: state.played,
    hasHistory: state.played > 0,
    eloBefore: round(state.elo),
    eloRecentChange: round(state.elo - (state.eloHistory[0] ?? state.elo)),
    restDays: restDays(state.lastTimestamp, timestamp),
    games7: gamesWithin(state.matchDates, timestamp, 7),
    games14: gamesWithin(state.matchDates, timestamp, 14),
    venueStreak: state.lastVenue === side ? state.venueStreak : 0,
    recentOpponentElo: meanOr(state.recent.slice(-5).map((match) => match.opponentElo)),
    form5: windowForm(state.recent, 5),
    form10: windowForm(state.recent, 10),
    form20: windowForm(state.recent, 20),
    venueForm10: windowForm(venue, 10),
    expWeightedGoalsFor: round(expWeighted(state.recent, timestamp, lambda, (match) => match.goalsFor)),
    expWeightedGoalsAgainst: round(expWeighted(state.recent, timestamp, lambda, (match) => match.goalsAgainst)),
    expWeightedPoints: round(expWeighted(state.recent, timestamp, lambda, (match) => match.points)),
  }
}

function windowForm(summaries: MatchSummary[], size: number): WindowForm {
  const window = summaries.slice(-size)
  const n = window.length
  if (n === 0) {
    return {
      sampleSize: 0, wins: 0, draws: 0, losses: 0, pointsPerGame: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, avgGoalsFor: 0, avgGoalsAgainst: 0,
      over15Pct: 0, over25Pct: 0, over35Pct: 0, bttsPct: 0, cleanSheetPct: 0, failedToScorePct: 0,
    }
  }
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0
  let over15 = 0, over25 = 0, over35 = 0, btts = 0, cleanSheet = 0, failedToScore = 0
  for (const match of window) {
    if (match.points === 3) wins += 1
    else if (match.points === 1) draws += 1
    else losses += 1
    goalsFor += match.goalsFor
    goalsAgainst += match.goalsAgainst
    if (match.totalOver15) over15 += 1
    if (match.totalOver25) over25 += 1
    if (match.totalOver35) over35 += 1
    if (match.btts) btts += 1
    if (match.goalsAgainst === 0) cleanSheet += 1
    if (match.goalsFor === 0) failedToScore += 1
  }
  return {
    sampleSize: n,
    wins, draws, losses,
    pointsPerGame: round((wins * 3 + draws) / n),
    goalsFor, goalsAgainst, goalDiff: goalsFor - goalsAgainst,
    avgGoalsFor: round(goalsFor / n), avgGoalsAgainst: round(goalsAgainst / n),
    over15Pct: round(over15 / n), over25Pct: round(over25 / n), over35Pct: round(over35 / n),
    bttsPct: round(btts / n), cleanSheetPct: round(cleanSheet / n), failedToScorePct: round(failedToScore / n),
  }
}

function updateTeam(state: TeamState, record: EngineeredMatchRecord, side: 'home' | 'away', timestamp: number | null, opponentElo: number) {
  const goalsFor = side === 'home' ? record.fullTimeHomeGoals : record.fullTimeAwayGoals
  const goalsAgainst = side === 'home' ? record.fullTimeAwayGoals : record.fullTimeHomeGoals
  const summary: MatchSummary = {
    points: goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0,
    goalsFor,
    goalsAgainst,
    totalOver15: record.totalGoals > 1.5,
    totalOver25: record.totalGoals > 2.5,
    totalOver35: record.totalGoals > 3.5,
    btts: record.fullTimeHomeGoals > 0 && record.fullTimeAwayGoals > 0,
    timestamp,
    opponentElo,
  }
  push(state.recent, summary, HISTORY_CAP)
  push(state.recentAtVenue[side], summary, HISTORY_CAP)
  if (timestamp !== null) push(state.matchDates, timestamp, 40)
  state.venueStreak = state.lastVenue === side ? state.venueStreak + 1 : 1
  state.lastVenue = side
  state.lastTimestamp = timestamp
  state.played += 1
}

function applyElo(home: TeamState, away: TeamState, record: EngineeredMatchRecord, homeEloBefore: number, awayEloBefore: number) {
  const expectedHome = 1 / (1 + 10 ** ((awayEloBefore - homeEloBefore - ELO_HOME_ADVANTAGE) / 400))
  const scoreHome = record.fullTimeHomeGoals > record.fullTimeAwayGoals ? 1 : record.fullTimeHomeGoals === record.fullTimeAwayGoals ? 0.5 : 0
  home.elo = homeEloBefore + ELO_K * (scoreHome - expectedHome)
  away.elo = awayEloBefore + ELO_K * ((1 - scoreHome) - (1 - expectedHome))
  push(home.eloHistory, homeEloBefore, 6)
  push(away.eloHistory, awayEloBefore, 6)
}

function availabilityFor(record: EngineeredMatchRecord): AvailabilityFlags {
  // Flags de disponibilidade da fonte (não confundir ausência de dado com zero).
  // A fonte/competição determina o que é rastreado, o que é conhecido antes do jogo.
  return {
    corners: record.totalCorners !== undefined,
    cards: record.totalCards !== undefined,
    xg: false,
    shots: false,
    possession: false,
  }
}

function restDays(lastTimestamp: number | null, timestamp: number | null) {
  if (lastTimestamp === null || timestamp === null) return null
  return Math.round((timestamp - lastTimestamp) / 86_400_000)
}

function gamesWithin(dates: number[], timestamp: number | null, days: number) {
  if (timestamp === null) return 0
  const cutoff = timestamp - days * 86_400_000
  return dates.filter((date) => date >= cutoff && date < timestamp).length
}

function expWeighted(summaries: MatchSummary[], timestamp: number | null, lambda: number, pick: (match: MatchSummary) => number) {
  if (summaries.length === 0) return 0
  let weighted = 0
  let weights = 0
  for (const match of summaries) {
    const daysAgo = timestamp !== null && match.timestamp !== null ? Math.max(0, (timestamp - match.timestamp) / 86_400_000) : 0
    const weight = Math.exp(-lambda * daysAgo)
    weighted += weight * pick(match)
    weights += weight
  }
  return weights > 0 ? weighted / weights : 0
}

function meanOr(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function push<T>(list: T[], value: T, cap: number) {
  list.push(value)
  if (list.length > cap) list.shift()
}

function pairKey(a: string, b: string) {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

function h2hHomeWinRate(h2h: H2HState | undefined, homeKey: string, awayKey: string): number | null {
  if (!h2h || h2h.meetings === 0) return null
  const homeWins = homeKey <= awayKey ? h2h.firstKeyWins : h2h.secondKeyWins
  return round(homeWins / h2h.meetings)
}

function updateH2H(
  h2h: H2HState | undefined,
  homeKey: string,
  awayKey: string,
  outcome: MatchOutcome,
  timestamp: number | null,
  season: string | null,
): H2HState {
  const state = h2h ?? { meetings: 0, firstKeyWins: 0, secondKeyWins: 0, draws: 0, lastTimestamp: null, lastSeason: null }
  state.meetings += 1
  const homeIsFirst = homeKey <= awayKey
  const homeWon = outcome === 'H'
  const awayWon = outcome === 'A'
  if (outcome === 'D') state.draws += 1
  else if ((homeWon && homeIsFirst) || (awayWon && !homeIsFirst)) state.firstKeyWins += 1
  else if (homeWon || awayWon) state.secondKeyWins += 1
  state.lastTimestamp = timestamp
  state.lastSeason = season
  return state
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
