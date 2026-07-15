/* =========================================================================
   BetIntel AI — dados mockados (simulados, fins acadêmicos/educacionais)

   Estes números NÃO são odds de uma casa de apostas real. São estimativas
   probabilísticas simuladas, usadas apenas para demonstração e estudo.

   Fixtures das 5 principais ligas, com no mínimo 3 jogos por liga.
   ========================================================================= */

import type { Confidence, LeagueId, Match, RecentMatch, Result } from '../types'
import { clamp } from '../lib/markets'
import { LEAGUES } from './leagues'

export { LEAGUES }
export type { LeagueMeta } from './leagues'

const LEAGUE_NAME: Record<LeagueId, string> = Object.fromEntries(
  LEAGUES.map((l) => [l.id, l.name]),
) as Record<LeagueId, string>

/* ---- raw fixtures -------------------------------------------------------- */

interface RawMatch {
  id: string
  leagueId: LeagueId
  date: string
  time: string
  period: Match['period']
  homeTeam: string
  awayTeam: string
  homeForm: Result[]
  awayForm: Result[]
  confidence: Confidence
  /** base probabilities (estimated %) */
  homeWin: number
  draw: number
  awayWin: number
  over15: number
  over25: number
  bothTeamsScore: number
  /** simulated stats */
  homeAvgGoalsFor: number
  awayAvgGoalsFor: number
  homeAvgGoalsAgainst: number
  awayAvgGoalsAgainst: number
  cleanSheets: number
}

const f = (s: string): Result[] => s.split('') as Result[]

const RAW: RawMatch[] = [
  // ---------------- Brasileirão Série A ----------------
  {
    id: 'm1', leagueId: 'BRA', date: 'Hoje · 24 Jun', time: '21:30', period: 'hoje',
    homeTeam: 'Flamengo', awayTeam: 'Palmeiras', homeForm: f('VVEDV'), awayForm: f('DVVED'),
    confidence: 'Alta', homeWin: 48, draw: 27, awayWin: 25, over15: 81, over25: 58, bothTeamsScore: 62,
    homeAvgGoalsFor: 1.9, awayAvgGoalsFor: 1.5, homeAvgGoalsAgainst: 0.9, awayAvgGoalsAgainst: 1.1, cleanSheets: 2,
  },
  {
    id: 'm2', leagueId: 'BRA', date: 'Hoje · 24 Jun', time: '19:00', period: 'hoje',
    homeTeam: 'Corinthians', awayTeam: 'São Paulo', homeForm: f('VEEDV'), awayForm: f('EVDDE'),
    confidence: 'Baixa', homeWin: 37, draw: 32, awayWin: 31, over15: 69, over25: 43, bothTeamsScore: 51,
    homeAvgGoalsFor: 1.2, awayAvgGoalsFor: 1.3, homeAvgGoalsAgainst: 1.2, awayAvgGoalsAgainst: 1.3, cleanSheets: 3,
  },
  {
    id: 'm3', leagueId: 'BRA', date: 'Amanhã · 25 Jun', time: '16:00', period: 'amanha',
    homeTeam: 'Grêmio', awayTeam: 'Atlético-MG', homeForm: f('VVDVE'), awayForm: f('DVEVV'),
    confidence: 'Média', homeWin: 41, draw: 29, awayWin: 30, over15: 75, over25: 51, bothTeamsScore: 57,
    homeAvgGoalsFor: 1.5, awayAvgGoalsFor: 1.6, homeAvgGoalsAgainst: 1.1, awayAvgGoalsAgainst: 1.2, cleanSheets: 2,
  },
  // ---------------- Premier League ----------------
  {
    id: 'm4', leagueId: 'PL', date: 'Amanhã · 25 Jun', time: '13:30', period: 'amanha',
    homeTeam: 'Arsenal', awayTeam: 'Liverpool', homeForm: f('VVVEV'), awayForm: f('VDVVE'),
    confidence: 'Alta', homeWin: 40, draw: 26, awayWin: 34, over15: 86, over25: 67, bothTeamsScore: 71,
    homeAvgGoalsFor: 2.1, awayAvgGoalsFor: 2.0, homeAvgGoalsAgainst: 1.0, awayAvgGoalsAgainst: 1.1, cleanSheets: 1,
  },
  {
    id: 'm5', leagueId: 'PL', date: '28 Jun · Sáb', time: '17:00', period: '7dias',
    homeTeam: 'Manchester City', awayTeam: 'Chelsea', homeForm: f('VVVVD'), awayForm: f('EVVDV'),
    confidence: 'Alta', homeWin: 55, draw: 24, awayWin: 21, over15: 88, over25: 64, bothTeamsScore: 59,
    homeAvgGoalsFor: 2.4, awayAvgGoalsFor: 1.7, homeAvgGoalsAgainst: 0.8, awayAvgGoalsAgainst: 1.2, cleanSheets: 2,
  },
  {
    id: 'm12', leagueId: 'PL', date: '1 Jul · Ter', time: '15:45', period: '7dias',
    homeTeam: 'Newcastle', awayTeam: 'Aston Villa', homeForm: f('VEVVD'), awayForm: f('EVDVE'),
    confidence: 'Média', homeWin: 44, draw: 27, awayWin: 29, over15: 80, over25: 55, bothTeamsScore: 61,
    homeAvgGoalsFor: 1.8, awayAvgGoalsFor: 1.6, homeAvgGoalsAgainst: 1.1, awayAvgGoalsAgainst: 1.2, cleanSheets: 2,
  },
  // ---------------- La Liga ----------------
  {
    id: 'm6', leagueId: 'LL', date: '29 Jun · Dom', time: '16:15', period: '7dias',
    homeTeam: 'Barcelona', awayTeam: 'Atlético de Madrid', homeForm: f('VVEVV'), awayForm: f('EVEDV'),
    confidence: 'Média', homeWin: 50, draw: 26, awayWin: 24, over15: 82, over25: 56, bothTeamsScore: 58,
    homeAvgGoalsFor: 2.2, awayAvgGoalsFor: 1.3, homeAvgGoalsAgainst: 1.0, awayAvgGoalsAgainst: 0.9, cleanSheets: 2,
  },
  {
    id: 'm7', leagueId: 'LL', date: 'Hoje · 24 Jun', time: '16:00', period: 'hoje',
    homeTeam: 'Real Madrid', awayTeam: 'Sevilla', homeForm: f('VVVVV'), awayForm: f('DEDVE'),
    confidence: 'Alta', homeWin: 62, draw: 22, awayWin: 16, over15: 84, over25: 60, bothTeamsScore: 55,
    homeAvgGoalsFor: 2.5, awayAvgGoalsFor: 1.2, homeAvgGoalsAgainst: 0.7, awayAvgGoalsAgainst: 1.4, cleanSheets: 3,
  },
  {
    id: 'm13', leagueId: 'LL', date: '1 Jul · Ter', time: '20:00', period: '7dias',
    homeTeam: 'Real Sociedad', awayTeam: 'Villarreal', homeForm: f('EVDEV'), awayForm: f('DEVDE'),
    confidence: 'Baixa', homeWin: 38, draw: 31, awayWin: 31, over15: 71, over25: 45, bothTeamsScore: 52,
    homeAvgGoalsFor: 1.4, awayAvgGoalsFor: 1.5, homeAvgGoalsAgainst: 1.3, awayAvgGoalsAgainst: 1.2, cleanSheets: 3,
  },
  // ---------------- Ligue 1 ----------------
  {
    id: 'm8', leagueId: 'L1', date: 'Amanhã · 25 Jun', time: '16:45', period: 'amanha',
    homeTeam: 'PSG', awayTeam: 'Lyon', homeForm: f('VVVEV'), awayForm: f('DVEDD'),
    confidence: 'Alta', homeWin: 64, draw: 21, awayWin: 15, over15: 85, over25: 63, bothTeamsScore: 57,
    homeAvgGoalsFor: 2.6, awayAvgGoalsFor: 1.4, homeAvgGoalsAgainst: 0.7, awayAvgGoalsAgainst: 1.5, cleanSheets: 2,
  },
  {
    id: 'm9', leagueId: 'L1', date: '30 Jun · Seg', time: '19:00', period: '7dias',
    homeTeam: 'Marseille', awayTeam: 'Monaco', homeForm: f('VEDVV'), awayForm: f('VVDEV'),
    confidence: 'Média', homeWin: 42, draw: 28, awayWin: 30, over15: 79, over25: 54, bothTeamsScore: 60,
    homeAvgGoalsFor: 1.7, awayAvgGoalsFor: 1.8, homeAvgGoalsAgainst: 1.2, awayAvgGoalsAgainst: 1.1, cleanSheets: 1,
  },
  {
    id: 'm14', leagueId: 'L1', date: 'Hoje · 24 Jun', time: '15:00', period: 'hoje',
    homeTeam: 'Lille', awayTeam: 'Nice', homeForm: f('VVEDV'), awayForm: f('EDVED'),
    confidence: 'Média', homeWin: 46, draw: 28, awayWin: 26, over15: 74, over25: 49, bothTeamsScore: 54,
    homeAvgGoalsFor: 1.6, awayAvgGoalsFor: 1.3, homeAvgGoalsAgainst: 1.0, awayAvgGoalsAgainst: 1.2, cleanSheets: 3,
  },
  // ---------------- Bundesliga ----------------
  {
    id: 'm10', leagueId: 'BUN', date: 'Hoje · 24 Jun', time: '13:30', period: 'hoje',
    homeTeam: 'Bayern Munich', awayTeam: 'Borussia Dortmund', homeForm: f('VVVVE'), awayForm: f('VVEVD'),
    confidence: 'Alta', homeWin: 53, draw: 23, awayWin: 24, over15: 90, over25: 72, bothTeamsScore: 74,
    homeAvgGoalsFor: 2.8, awayAvgGoalsFor: 2.1, homeAvgGoalsAgainst: 1.0, awayAvgGoalsAgainst: 1.3, cleanSheets: 1,
  },
  {
    id: 'm11', leagueId: 'BUN', date: 'Amanhã · 25 Jun', time: '14:30', period: 'amanha',
    homeTeam: 'Leverkusen', awayTeam: 'RB Leipzig', homeForm: f('VVEVV'), awayForm: f('VDVEV'),
    confidence: 'Média', homeWin: 47, draw: 27, awayWin: 26, over15: 83, over25: 59, bothTeamsScore: 63,
    homeAvgGoalsFor: 2.0, awayAvgGoalsFor: 1.7, homeAvgGoalsAgainst: 1.1, awayAvgGoalsAgainst: 1.2, cleanSheets: 2,
  },
  {
    id: 'm15', leagueId: 'BUN', date: '2 Jul · Qua', time: '15:30', period: '7dias',
    homeTeam: 'Stuttgart', awayTeam: 'Eintracht Frankfurt', homeForm: f('VEVVD'), awayForm: f('VVDEV'),
    confidence: 'Média', homeWin: 45, draw: 26, awayWin: 29, over15: 85, over25: 61, bothTeamsScore: 66,
    homeAvgGoalsFor: 2.1, awayAvgGoalsFor: 1.9, homeAvgGoalsAgainst: 1.2, awayAvgGoalsAgainst: 1.3, cleanSheets: 1,
  },
  {
    id: 'm16', leagueId: 'WC2026', date: '11 Jun', time: '16:00', period: '7dias',
    homeTeam: 'Mexico', awayTeam: 'South Africa', homeForm: f('VEVDE'), awayForm: f('DVEEV'),
    confidence: 'Baixa', homeWin: 39, draw: 31, awayWin: 30, over15: 70, over25: 45, bothTeamsScore: 51,
    homeAvgGoalsFor: 1.4, awayAvgGoalsFor: 1.2, homeAvgGoalsAgainst: 1.1, awayAvgGoalsAgainst: 1.3, cleanSheets: 2,
  },
  {
    id: 'm17', leagueId: 'WC2026', date: '12 Jun', time: '19:00', period: '7dias',
    homeTeam: 'United States', awayTeam: 'Canada', homeForm: f('VVEVD'), awayForm: f('EVDDV'),
    confidence: 'Baixa', homeWin: 43, draw: 29, awayWin: 28, over15: 74, over25: 48, bothTeamsScore: 54,
    homeAvgGoalsFor: 1.6, awayAvgGoalsFor: 1.4, homeAvgGoalsAgainst: 1.2, awayAvgGoalsAgainst: 1.2, cleanSheets: 2,
  },
]

/* ---- derived content (recent games + AI summary) ------------------------ */

const OPPONENT_POOL: Record<LeagueId, string[]> = {
  BRA: ['Bahia', 'Botafogo', 'Cruzeiro', 'Internacional', 'Fortaleza'],
  PL: ['Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham'],
  LL: ['Villarreal', 'Real Sociedad', 'Betis', 'Valencia', 'Girona'],
  L1: ['Lille', 'Nice', 'Rennes', 'Lens', 'Nantes'],
  BUN: ['Stuttgart', 'Frankfurt', 'Wolfsburg', 'Freiburg', 'Union Berlin'],
  WC2026: ['Brasil', 'Argentina', 'France', 'Spain', 'Japan'],
}

function scoreFor(letter: Result, i: number): string {
  if (letter === 'V') return ['2-1', '3-1', '2-0', '1-0', '3-2'][i % 5]
  if (letter === 'E') return ['1-1', '0-0', '2-2'][i % 3]
  return ['0-1', '1-2', '0-2'][i % 3]
}

function buildRecent(form: Result[], leagueId: LeagueId): RecentMatch[] {
  const pool = OPPONENT_POOL[leagueId]
  return form.map((letter, i) => ({
    result: letter,
    opponent: pool[i % pool.length],
    score: scoreFor(letter, i),
  }))
}

/** Natural-language estimate — mirrors the design's template, deterministic. */
function summarize(r: RawMatch): string {
  const goalsTend = r.over25 >= 60 ? 'alta' : r.over25 >= 48 ? 'moderada' : 'baixa'
  const candidates: { label: string; val: number }[] = [
    { label: 'Over 1.5 gols', val: r.over15 },
    { label: 'Ambas Marcam', val: r.bothTeamsScore },
    { label: 'Dupla Chance Casa/Empate', val: Math.min(95, r.homeWin + r.draw) },
    { label: 'Under 3.5 gols', val: 100 - clamp(r.over25 * 0.62) },
    { label: 'Over 2.5 gols', val: r.over25 },
  ].sort((a, b) => b.val - a.val)
  const top = candidates[0]
  const x12max = Math.max(r.homeWin, r.draw, r.awayWin)
  const incerteza = x12max >= 55 ? 'um favorito mais definido' : 'maior incerteza'
  return (
    `O confronto entre ${r.homeTeam} e ${r.awayTeam} apresenta tendência ${goalsTend} para gols, ` +
    `com ambos os times mantendo média ofensiva relevante nos últimos jogos. ` +
    `O mercado ${top.label} tem a melhor sustentação estatística (${top.val}%), ` +
    `enquanto o 1X2 apresenta ${incerteza}.`
  )
}

function enrich(r: RawMatch): Match {
  return {
    id: r.id,
    leagueId: r.leagueId,
    league: LEAGUE_NAME[r.leagueId],
    date: r.date,
    time: r.time,
    period: r.period,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    homeForm: r.homeForm,
    awayForm: r.awayForm,
    probabilities: {
      homeWin: r.homeWin,
      draw: r.draw,
      awayWin: r.awayWin,
      over15: r.over15,
      over25: r.over25,
      bothTeamsScore: r.bothTeamsScore,
      doubleChance: Math.min(96, r.homeWin + r.draw),
    },
    stats: {
      homeAvgGoalsFor: r.homeAvgGoalsFor,
      awayAvgGoalsFor: r.awayAvgGoalsFor,
      homeAvgGoalsAgainst: r.homeAvgGoalsAgainst,
      awayAvgGoalsAgainst: r.awayAvgGoalsAgainst,
      over15Rate: r.over15,
      over25Rate: r.over25,
      bttsRate: r.bothTeamsScore,
      cleanSheets: r.cleanSheets,
    },
    lastMatchesHome: buildRecent(r.homeForm, r.leagueId),
    lastMatchesAway: buildRecent(r.awayForm, r.leagueId),
    aiSummary: summarize(r),
    confidence: r.confidence,
  }
}

export const matches: Match[] = RAW.map(enrich)

const SCREENSHOT_MATCH_IDS = new Set(['m1', 'm4', 'm6', 'm10'])

/**
 * Pequena amostra exclusivamente visual, ativada pelo frontend com `?demo=1`.
 * Não participa do carregamento normal e nunca funciona como fallback da API.
 */
export const screenshotMatches: Match[] = matches
  .filter((match) => SCREENSHOT_MATCH_IDS.has(match.id))
  .map((match, index) => ({
    ...match,
    id: `screenshot-${match.id}`,
    date: index < 2 ? 'Hoje · demonstração' : 'Próximos dias',
    period: index < 2 ? 'hoje' : '7dias',
    sourceProvider: 'Demonstração visual local',
    updatedAt: undefined,
    sampleSize: 240 + index * 35,
    ethicalNotice:
      'Dados simulados para demonstração visual. Análises históricas não garantem resultados futuros.',
    isFallback: true,
  }))
