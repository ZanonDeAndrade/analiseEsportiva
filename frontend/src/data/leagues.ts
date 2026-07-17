import type { LeagueId } from '../types'

export interface LeagueMeta {
  id: LeagueId
  name: string
}

export const LEAGUES: LeagueMeta[] = [
  { id: 'BRA', name: 'Brasileirão Série A' },
  { id: 'PL', name: 'Premier League' },
  { id: 'LL', name: 'La Liga' },
  { id: 'L1', name: 'Ligue 1' },
  { id: 'BUN', name: 'Bundesliga' },
]
