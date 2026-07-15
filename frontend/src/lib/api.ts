import type { Confidence, LeagueId, Match } from '../types'

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

export type AccessTokenProvider = () => Promise<string>

export async function loadBackendMatches(
  getAccessToken: AccessTokenProvider,
  _forceRefresh = false,
): Promise<Match[]> {
  const fixturePayload = await fetchJson<{ fixtures: BackendFixture[] }>(
    '/fixtures',
    getAccessToken,
  )
  const fixtures = fixturePayload.fixtures

  return Promise.all(
    fixtures.map(async (fixture) => {
      const prediction = await predictFixture(fixture, getAccessToken)
      return mapFixtureToMatch(fixture, prediction)
    }),
  )
}

async function predictFixture(
  fixture: BackendFixture,
  getAccessToken: AccessTokenProvider,
): Promise<BackendPrediction | null> {
  try {
    return await fetchJson<BackendPrediction>('/predictions', getAccessToken, {
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

export async function authenticatedFetchJson<T>(
  path: string,
  getAccessToken: AccessTokenProvider,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  const token = await getAccessToken()

  try {
    response = await fetch(`${BACKEND_URL}${path.startsWith('/v1/') ? path : `/v1${path}`}`, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers).entries()),
        authorization: `Bearer ${token}`,
      },
    })
  } catch {
    throw new Error(`Backend indisponivel em ${BACKEND_URL}`)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(problem?.detail ?? `Backend retornou HTTP ${response.status}`)
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

const fetchJson = authenticatedFetchJson

function mapFixtureToMatch(fixture: BackendFixture, prediction: BackendPrediction | null): Match {
  const probabilities = probabilitiesFromPrediction(prediction)
  const confidence = normalizeConfidence(prediction?.confidence)
  // A fonte exibida e o status de fallback refletem a FIXTURE (de onde vem o
  // jogo/data), nao o modelo de predicao — que pode ter sido treinado em parte
  // com dados de demonstracao sem que o jogo em si seja simulado.
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
    homeForm: [],
    awayForm: [],
    probabilities,
    stats: {
      homeAvgGoalsFor: undefined,
      awayAvgGoalsFor: undefined,
      homeAvgGoalsAgainst: undefined,
      awayAvgGoalsAgainst: undefined,
      over15Rate: probabilities.over15,
      over25Rate: probabilities.over25,
      bttsRate: probabilities.bothTeamsScore,
      cleanSheets: undefined,
    },
    lastMatchesHome: [],
    lastMatchesAway: [],
    aiSummary: summaryFor(fixture, prediction),
    confidence,
    sourceProvider,
    updatedAt,
    sampleSize: prediction?.sampleSize,
    ethicalNotice: prediction?.ethicalNotice,
    // [] marca a origem backend e impede a derivacao visual do modo demo
    // quando a predicao estiver indisponivel.
    availableMarkets: prediction?.availableMarkets ?? [],
    ignoredMarkets: prediction?.ignoredMarkets,
    isFallback: fixture.isFallback || fixture.sourceProvider.includes('mock'),
  }
}

function probabilitiesFromPrediction(prediction: BackendPrediction | null): Match['probabilities'] {
  if (!prediction) return {}

  return {
    homeWin: marketProbability(prediction, '1X2', 'home_win'),
    draw: marketProbability(prediction, '1X2', 'draw'),
    awayWin: marketProbability(prediction, '1X2', 'away_win'),
    over15: marketProbability(prediction, 'OVER_1_5_GOALS', 'over_1_5'),
    over25: marketProbability(prediction, 'OVER_2_5_GOALS', 'over_2_5'),
    bothTeamsScore: marketProbability(prediction, 'BOTH_TEAMS_SCORE', 'btts_yes'),
    doubleChance: marketProbability(prediction, 'DOUBLE_CHANCE', '1x'),
  }
}

function marketProbability(
  prediction: BackendPrediction,
  market: string,
  selectionKey: string,
) {
  return prediction.availableMarkets
    ?.find((item) => item.market === market)
    ?.selections.find((selection) => selection.key === selectionKey)?.probability
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

function summaryFor(fixture: BackendFixture, prediction: BackendPrediction | null) {
  if (!prediction) {
    return `Fixture persistida para ${fixture.homeTeam} x ${fixture.awayTeam}. Nenhuma predicao pronta esta disponivel; nenhuma probabilidade foi inventada.`
  }

  const ignored = prediction.ignoredMarkets?.length ?? 0
  return `Estimativa educacional para ${fixture.homeTeam} x ${fixture.awayTeam} em ${fixture.competition}. O modelo usa frequencias historicas segmentadas, com ${prediction.availableMarkets?.length ?? 0} mercados disponiveis e ${ignored} mercados ignorados por dados insuficientes.`
}
