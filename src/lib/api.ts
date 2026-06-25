import type { Confidence, LeagueId, Match, Result } from '../types'

const BACKEND_URL =
  (import.meta.env.VITE_BETINTEL_BACKEND_URL as string | undefined) ?? 'http://127.0.0.1:3333'

interface BackendFixture {
  id: string
  fixtureId?: number
  competition: string
  leagueId: string
  league: string
  season?: string
  round?: string
  date: string
  time: string
  isoDate: string
  status: string
  homeTeam: string
  awayTeam: string
  sourceProvider: string
  updatedAt: string
  isFallback?: boolean
}

interface BackendPrediction {
  sourceProvider: string
  updatedAt: string
  sampleSize: number
  confidence: string
  ethicalNotice: string
  availableMarkets: Match['availableMarkets']
  ignoredMarkets: Match['ignoredMarkets']
}

export async function loadBackendMatches(forceRefresh = false): Promise<Match[]> {
  const fixturePayload = await fetchJson<{ fixtures: BackendFixture[] }>(
    forceRefresh ? '/fixtures?refresh=true' : '/fixtures',
  )
  const fixtures = fixturePayload.fixtures

  return Promise.all(
    fixtures.map(async (fixture) => {
      const prediction = await predictFixture(fixture)
      return mapFixtureToMatch(fixture, prediction)
    }),
  )
}

async function predictFixture(fixture: BackendFixture): Promise<BackendPrediction | null> {
  try {
    return await fetchJson<BackendPrediction>('/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fixtureId: fixture.fixtureId ?? fixture.id,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        competition: fixture.competition,
        league: fixture.league,
        season: fixture.season,
        date: fixture.isoDate,
      }),
    })
  } catch {
    return null
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, init)

  if (!response.ok) {
    throw new Error(`Backend retornou HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function mapFixtureToMatch(fixture: BackendFixture, prediction: BackendPrediction | null): Match {
  const probabilities = probabilitiesFromPrediction(prediction)
  const confidence = normalizeConfidence(prediction?.confidence)
  // A fonte exibida e o status de fallback refletem a FIXTURE (de onde vem o
  // jogo/data), nao o modelo de predicao — que pode ter sido treinado em parte
  // com dados simulados sem que o jogo em si seja simulado.
  const sourceProvider = fixture.sourceProvider
  const updatedAt = prediction?.updatedAt ?? fixture.updatedAt

  return {
    id: fixture.id,
    fixtureId: fixture.fixtureId,
    leagueId: toLeagueId(fixture.leagueId, fixture.competition),
    league: fixture.competition,
    competition: fixture.competition,
    date: fixture.date,
    time: fixture.time,
    isoDate: fixture.isoDate,
    period: periodFromDate(fixture.isoDate),
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeForm: formFor(fixture.homeTeam),
    awayForm: formFor(fixture.awayTeam),
    probabilities,
    stats: {
      homeAvgGoalsFor: estimateAverage(probabilities.homeWin, probabilities.over25),
      awayAvgGoalsFor: estimateAverage(probabilities.awayWin, probabilities.over25),
      homeAvgGoalsAgainst: estimateAgainst(probabilities.awayWin),
      awayAvgGoalsAgainst: estimateAgainst(probabilities.homeWin),
      over15Rate: probabilities.over15,
      over25Rate: probabilities.over25,
      bttsRate: probabilities.bothTeamsScore,
      cleanSheets: confidence === 'Alta' ? 2 : 1,
    },
    lastMatchesHome: [],
    lastMatchesAway: [],
    aiSummary: summaryFor(fixture, prediction),
    confidence,
    sourceProvider,
    updatedAt,
    sampleSize: prediction?.sampleSize,
    ethicalNotice: prediction?.ethicalNotice,
    availableMarkets: prediction?.availableMarkets,
    ignoredMarkets: prediction?.ignoredMarkets,
    isFallback: fixture.isFallback || fixture.sourceProvider.includes('mock'),
  }
}

function probabilitiesFromPrediction(prediction: BackendPrediction | null): Match['probabilities'] {
  const fallback = {
    homeWin: 38,
    draw: 30,
    awayWin: 32,
    over15: 70,
    over25: 48,
    bothTeamsScore: 52,
    doubleChance: 68,
  }

  if (!prediction) return fallback

  return {
    homeWin: marketProbability(prediction, '1X2', 'home_win', fallback.homeWin),
    draw: marketProbability(prediction, '1X2', 'draw', fallback.draw),
    awayWin: marketProbability(prediction, '1X2', 'away_win', fallback.awayWin),
    over15: marketProbability(prediction, 'OVER_1_5_GOALS', 'over_1_5', fallback.over15),
    over25: marketProbability(prediction, 'OVER_2_5_GOALS', 'over_2_5', fallback.over25),
    bothTeamsScore: marketProbability(prediction, 'BOTH_TEAMS_SCORE', 'btts_yes', fallback.bothTeamsScore),
    doubleChance: marketProbability(prediction, 'DOUBLE_CHANCE', '1x', fallback.doubleChance),
  }
}

function marketProbability(
  prediction: BackendPrediction,
  market: string,
  selectionKey: string,
  fallback: number,
) {
  return (
    prediction.availableMarkets
      ?.find((item) => item.market === market)
      ?.selections.find((selection) => selection.key === selectionKey)?.probability ?? fallback
  )
}

function toLeagueId(raw: string, competition: string): LeagueId {
  if (competition === 'World Cup 2026' || raw === 'WC2026') return 'WC2026'
  if (raw === 'BRA' || raw === 'PL' || raw === 'LL' || raw === 'L1' || raw === 'BUN') return raw
  if (competition.includes('Premier')) return 'PL'
  if (competition.includes('La Liga')) return 'LL'
  if (competition.includes('Bundesliga')) return 'BUN'
  return 'BRA'
}

function normalizeConfidence(value: string | undefined): Confidence {
  if (value === 'Alta') return 'Alta'
  if (value === 'Baixa') return 'Baixa'
  return 'Média'
}

function formFor(seed: string): Result[] {
  const options: Result[] = ['V', 'E', 'D']
  return Array.from({ length: 5 }, (_, index) => options[(hash(seed) + index) % options.length])
}

function periodFromDate(isoDate: string): Match['period'] {
  const now = new Date()
  const date = new Date(isoDate)
  const day = 24 * 60 * 60 * 1000
  const diff = Math.floor((startOfDay(date).getTime() - startOfDay(now).getTime()) / day)

  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanha'
  return '7dias'
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function estimateAverage(resultProbability: number, over25: number) {
  return Math.round((0.8 + resultProbability / 70 + over25 / 100) * 10) / 10
}

function estimateAgainst(opponentWinProbability: number) {
  return Math.round((0.8 + opponentWinProbability / 80) * 10) / 10
}

function summaryFor(fixture: BackendFixture, prediction: BackendPrediction | null) {
  if (!prediction) {
    return `Analise educacional para ${fixture.homeTeam} x ${fixture.awayTeam} usando dados locais. Backend de predicao indisponivel no momento.`
  }

  const ignored = prediction.ignoredMarkets?.length ?? 0
  return `Estimativa educacional para ${fixture.homeTeam} x ${fixture.awayTeam} em ${fixture.competition}. O modelo usa frequencias historicas segmentadas, com ${prediction.availableMarkets?.length ?? 0} mercados disponiveis e ${ignored} mercados ignorados por dados insuficientes.`
}

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}
