export const fixtureLifecycleStatuses = [
  'scheduled',
  'not_started',
  'live',
  'halftime',
  'finished',
  'postponed',
  'cancelled',
  'abandoned',
  'extra_time',
  'penalties',
  'unknown',
] as const

export type FixtureLifecycleStatus = (typeof fixtureLifecycleStatuses)[number]
export type MatchDecision = 'regulation' | 'extra_time' | 'penalties' | 'administrative'

export interface ResultContext {
  homeGoals: number
  awayGoals: number
  homeExtraTimeGoals?: number
  awayExtraTimeGoals?: number
  homePenaltyGoals?: number
  awayPenaltyGoals?: number
  decision: MatchDecision
  outcome: 'H' | 'D' | 'A'
  winner: 'home' | 'away' | 'draw' | 'undetermined'
}

export interface FreshnessAssessment {
  state: 'current' | 'stale' | 'missing_timestamp'
  observedAt?: string
  freshUntil?: string
}

const STATUS_MAP: Readonly<Record<string, FixtureLifecycleStatus>> = {
  NS: 'not_started',
  TBD: 'not_started',
  SCHEDULED: 'not_started',
  TIMED: 'not_started',
  '1H': 'live',
  '2H': 'live',
  LIVE: 'live',
  IN_PLAY: 'live',
  HT: 'halftime',
  BT: 'halftime',
  PAUSED: 'halftime',
  ET: 'extra_time',
  P: 'penalties',
  FT: 'finished',
  FINISHED: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'postponed',
  POSTPONED: 'postponed',
  CANC: 'cancelled',
  CANCELLED: 'cancelled',
  ABD: 'abandoned',
  AWD: 'abandoned',
  WO: 'abandoned',
  ABANDONED: 'abandoned',
  SUSPENDED: 'abandoned',
  AWARDED: 'abandoned',
}

export function normalizeProviderFixtureStatus(rawStatus: string): FixtureLifecycleStatus {
  return STATUS_MAP[rawStatus.trim().toUpperCase()] ?? 'unknown'
}

export function decisionFromProviderStatus(rawStatus: string): MatchDecision {
  const status = rawStatus.trim().toUpperCase()
  if (status === 'PEN' || status === 'P') return 'penalties'
  if (status === 'AET' || status === 'ET') return 'extra_time'
  if (status === 'AWD' || status === 'WO') return 'administrative'
  return 'regulation'
}

export function buildResultContext(input: {
  homeGoals: number
  awayGoals: number
  homeExtraTimeGoals?: number
  awayExtraTimeGoals?: number
  homePenaltyGoals?: number
  awayPenaltyGoals?: number
  decision?: MatchDecision
}): ResultContext {
  const decision = input.decision ?? 'regulation'
  const outcome = input.homeGoals > input.awayGoals ? 'H' : input.homeGoals < input.awayGoals ? 'A' : 'D'
  let winner: ResultContext['winner'] = outcome === 'H' ? 'home' : outcome === 'A' ? 'away' : 'draw'

  if (decision === 'penalties') {
    const home = input.homePenaltyGoals
    const away = input.awayPenaltyGoals
    winner = home === undefined || away === undefined
      ? 'undetermined'
      : home > away
        ? 'home'
        : away > home
          ? 'away'
          : 'undetermined'
  }

  return { ...input, decision, outcome, winner }
}

export function assessFreshness(
  observedAt: string | undefined,
  maximumAgeMs: number,
  now = new Date(),
): FreshnessAssessment {
  if (!observedAt) return { state: 'missing_timestamp' }
  const observed = new Date(observedAt)
  if (Number.isNaN(observed.getTime())) return { state: 'missing_timestamp' }
  const freshUntil = new Date(observed.getTime() + maximumAgeMs).toISOString()
  return {
    state: now.getTime() <= observed.getTime() + maximumAgeMs ? 'current' : 'stale',
    observedAt: observed.toISOString(),
    freshUntil,
  }
}

export function recordFingerprint(record: {
  sourceProvider: string
  externalId: string
  startsAt: string
  status: FixtureLifecycleStatus
  sourceUpdatedAt?: string
  result?: ResultContext
}) {
  return JSON.stringify({
    provider: record.sourceProvider,
    externalId: record.externalId,
    startsAt: record.startsAt,
    status: record.status,
    sourceUpdatedAt: record.sourceUpdatedAt ?? null,
    result: record.result ?? null,
  })
}
