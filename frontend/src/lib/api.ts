import type { Confidence, LeagueId, Match } from '../types'

export const BACKEND_URL =
  (import.meta.env.VITE_BETINTEL_BACKEND_URL as string | undefined) ?? 'http://127.0.0.1:3333'

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()

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
  modelVersion: string
  datasetVersion?: string
  codeVersion: string
  featureSetVersion: string
  period: { from: string; to: string }
  limitations: string[]
}

export type AccessTokenProvider = () => Promise<string>

export interface LegalServerDocument {
  id: string
  type: 'terms' | 'privacy' | 'risk' | 'refund' | 'acceptable_use' | 'responsible_gaming'
  version: string
  title: string
  contentHash: string
  documentUrl: string
  acceptanceGroup: string
  changeKind: 'material' | 'non_material'
  changeSummary: string
  isActive: boolean
}

export interface LegalAcceptanceStatus {
  requiresAcceptance: boolean
  requiredDocuments: LegalServerDocument[]
  missingDocumentTypes: LegalServerDocument['type'][]
  acceptedAt?: string
}

export interface LegalAcceptanceEvidence {
  id: string
  documentType: LegalServerDocument['type']
  documentVersion: string
  acceptedAt: string
  contentHash: string
  documentUrl: string
  acceptancePurpose: string
}

export interface DataQualityIssue {
  id: string
  issueType: string
  sourceProvider: string
  externalId?: string
  status: 'open' | 'resolved' | 'rejected'
  message: string
  createdAt: string
}

export interface TeamAliasReview {
  id: string
  sourceProvider: string
  alias: string
  canonicalName: string
  reviewStatus: 'auto_accepted' | 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface DataFreshnessSummary {
  current: number
  stale: number
  missingTimestamp: number
  checkedAt: string
}

export function loadDataOperations(getAccessToken: AccessTokenProvider) {
  return Promise.all([
    authenticatedFetchJson<{ issues: DataQualityIssue[] }>('/v1/admin/data-quality?status=open', getAccessToken),
    authenticatedFetchJson<{ aliases: TeamAliasReview[] }>('/v1/admin/team-aliases?status=pending', getAccessToken),
    authenticatedFetchJson<DataFreshnessSummary>('/v1/admin/data-freshness', getAccessToken),
  ]).then(([issues, aliases, freshness]) => ({ issues: issues.issues, aliases: aliases.aliases, freshness }))
}

export function resolveDataQualityIssue(getAccessToken: AccessTokenProvider, id: string) {
  return authenticatedFetchJson(`/v1/admin/data-quality/${encodeURIComponent(id)}`, getAccessToken, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resolution: { action: 'reviewed_in_admin' } }),
  })
}

export function reviewTeamAlias(
  getAccessToken: AccessTokenProvider,
  id: string,
  status: 'approved' | 'rejected',
) {
  return authenticatedFetchJson(`/v1/admin/team-aliases/${encodeURIComponent(id)}`, getAccessToken, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
  })
}

export async function loadBackendMatches(
  getAccessToken: AccessTokenProvider,
  options: boolean | { forceRefresh?: boolean; signal?: AbortSignal } = false,
): Promise<{
  matches: Match[]
  warnings: string[]
  sourceProvider: string
  updatedAt: string
}> {
  const forceRefresh = typeof options === 'boolean' ? options : options.forceRefresh ?? false
  const signal = typeof options === 'boolean' ? undefined : options.signal
  const fixturePayload = await cachedAuthenticatedFetchJson<{
    fixtures: BackendFixture[]
    warnings?: string[]
    sourceProvider?: string
    updatedAt?: string
  }>(
    'fixtures:upcoming', '/fixtures', getAccessToken, { ttlMs: 5 * 60_000, forceRefresh, signal },
  )
  const fixtures = fixturePayload.fixtures

  const matches = await Promise.all(
    fixtures.map(async (fixture) => {
      try {
        const prediction = await predictFixture(fixture, getAccessToken, { forceRefresh, signal })
        return mapFixtureToMatch(fixture, prediction)
      } catch (error) {
        return mapFixtureToMatch(fixture, null, errorMessage(error))
      }
    }),
  )

  return {
    matches,
    warnings: fixturePayload.warnings ?? [],
    sourceProvider: fixturePayload.sourceProvider ?? 'desconhecido',
    updatedAt: fixturePayload.updatedAt ?? '',
  }
}

async function predictFixture(
  fixture: BackendFixture,
  getAccessToken: AccessTokenProvider,
  options: { forceRefresh: boolean; signal?: AbortSignal },
): Promise<BackendPrediction | null> {
  return cachedAuthenticatedFetchJson<BackendPrediction>(
    `prediction:${fixture.id}:${fixture.updatedAt}`,
    '/predictions',
    getAccessToken,
    { ttlMs: 5 * 60_000, forceRefresh: options.forceRefresh, signal: options.signal },
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        fixtureId: fixture.fixtureId ?? fixture.id,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        competition: fixture.competition,
        league: fixture.league,
        season: fixture.season,
        date: fixture.isoDate,
      }),
    },
  )
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
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    const unavailable = new Error(`Backend indisponivel em ${BACKEND_URL}`) as Error & { cause: unknown }
    unavailable.cause = error
    throw unavailable
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string; code?: string; requestId?: string } | null
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('betintel:session-expired'))
    }
    throw new ApiRequestError(
      problem?.detail ?? `Backend retornou HTTP ${response.status}`,
      response.status,
      problem?.code,
      problem?.requestId,
    )
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export async function cachedAuthenticatedFetchJson<T>(
  cacheKey: string,
  path: string,
  getAccessToken: AccessTokenProvider,
  options: { ttlMs: number; forceRefresh?: boolean; signal?: AbortSignal },
  init?: RequestInit,
): Promise<T> {
  if (!options.forceRefresh) {
    const cached = responseCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.value as T
    const pending = options.signal ? undefined : inFlight.get(cacheKey)
    if (pending) return pending as Promise<T>
  }
  const request = authenticatedFetchJson<T>(path, getAccessToken, { ...init, signal: options.signal })
    .then((value) => {
      responseCache.set(cacheKey, { expiresAt: Date.now() + options.ttlMs, value })
      return value
    })
    .finally(() => { if (inFlight.get(cacheKey) === request) inFlight.delete(cacheKey) })
  if (!options.signal) inFlight.set(cacheKey, request)
  return request
}

export function invalidateApiCache(prefix = '') {
  for (const key of responseCache.keys()) if (key.startsWith(prefix)) responseCache.delete(key)
}

export function loadLegalStatus(getAccessToken: AccessTokenProvider) {
  return authenticatedFetchJson<LegalAcceptanceStatus>('/v1/legal/status', getAccessToken)
}

export function recordLegalAcceptance(
  getAccessToken: AccessTokenProvider,
  status: LegalAcceptanceStatus,
  input: {
    purpose: 'signup' | 'first_access' | 'material_update'
    idempotencyKey: string
  },
) {
  const privacy = status.requiredDocuments.find((document) => document.type === 'privacy')
  const risk = status.requiredDocuments.find((document) => document.type === 'risk')
  if (!privacy || !risk) throw new Error('Documentos jurídicos obrigatórios indisponíveis.')
  return authenticatedFetchJson<{ acceptedAt: string; acceptances: LegalAcceptanceEvidence[] }>(
    '/v1/legal/acceptances',
    getAccessToken,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': input.idempotencyKey },
      body: JSON.stringify({
        purpose: input.purpose,
        documents: status.requiredDocuments.map(({ type, version, contentHash }) => ({ type, version, contentHash })),
        declarations: { age18: true, termsAndPrivacy: true, risk: true },
        evidence: {
          origin: input.purpose === 'material_update' ? 'material_update' : input.purpose,
          riskVersion: risk.version,
          privacyVersion: privacy.version,
        },
      }),
    },
  )
}

export function loadLegalAcceptances(getAccessToken: AccessTokenProvider) {
  return authenticatedFetchJson<{ acceptances: LegalAcceptanceEvidence[] }>(
    '/v1/legal/acceptances',
    getAccessToken,
  )
}

function mapFixtureToMatch(fixture: BackendFixture, prediction: BackendPrediction | null, predictionError?: string): Match {
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
    modelVersion: prediction?.modelVersion,
    datasetVersion: prediction?.datasetVersion,
    codeVersion: prediction?.codeVersion,
    featureSetVersion: prediction?.featureSetVersion,
    modelPeriod: prediction?.period,
    limitations: prediction?.limitations,
    // [] marca a origem backend e impede a derivacao visual do modo demo
    // quando a predicao estiver indisponivel.
    availableMarkets: prediction?.availableMarkets ?? [],
    ignoredMarkets: prediction?.ignoredMarkets,
    backendError: predictionError,
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

function errorMessage(value: unknown) {
  if (value instanceof DOMException && value.name === 'AbortError') return 'Solicitacao cancelada antes da conclusao.'
  return value instanceof Error ? value.message : 'Predicao indisponivel sem detalhe adicional.'
}
