/* Builds the data shown in the right-hand analysis panel for a fixture:
   the indicator grid, the "best evidence" market bars and the confidence
   labels. Ported from the original design logic. */

import type { Match } from '../types'
import { clamp } from './markets'
import { CONFIDENCE_TEXT } from './theme'

export interface StatItem {
  label: string
  value: string
  strong: boolean
}

export interface EvidenceMarket {
  label: string
  value: number
  valueText: string
  /** >= 65% — treated as strong (green); otherwise amber/red below 50%. */
  strong: boolean
}

export interface Analysis {
  title: string
  leagueDate: string
  confidenceText: string // e.g. "Confiança Alto"
  confidenceLabel: string // e.g. "Alto"
  stats: StatItem[]
  evidenceMarkets: EvidenceMarket[]
}

export function buildAnalysis(m: Match): Analysis {
  const p = m.probabilities
  const s = m.stats

  const dc = Math.min(95, p.homeWin + p.draw)
  const u35 = 100 - clamp(p.over25 * 0.62)

  const evidenceMarkets: EvidenceMarket[] = [
    { label: 'Over 1.5 gols', value: p.over15 },
    { label: 'Ambas Marcam', value: p.bothTeamsScore },
    { label: 'Dupla Chance Casa/Empate', value: dc },
    { label: 'Under 3.5 gols', value: u35 },
    { label: 'Over 2.5 gols', value: p.over25 },
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((bm) => ({
      label: bm.label,
      value: bm.value,
      valueText: bm.value + '%',
      strong: bm.value >= 65,
    }))

  const stats: StatItem[] = [
    { label: 'Média de gols · mandante', value: s.homeAvgGoalsFor.toFixed(1), strong: s.homeAvgGoalsFor >= 2 },
    { label: 'Média de gols · visitante', value: s.awayAvgGoalsFor.toFixed(1), strong: s.awayAvgGoalsFor >= 2 },
    { label: 'Over 1.5 · últimos jogos', value: p.over15 + '%', strong: p.over15 >= 75 },
    { label: 'Over 2.5 · últimos jogos', value: p.over25 + '%', strong: p.over25 >= 60 },
    { label: 'Ambas Marcam · histórico', value: p.bothTeamsScore + '%', strong: p.bothTeamsScore >= 60 },
    { label: 'Clean sheets · últimos 5', value: s.cleanSheets + '/5', strong: false },
  ]

  return {
    title: `${m.homeTeam} × ${m.awayTeam}`,
    leagueDate: `${m.league} · ${m.date} · ${m.time}`,
    confidenceText: 'Confiança ' + CONFIDENCE_TEXT[m.confidence],
    confidenceLabel: CONFIDENCE_TEXT[m.confidence],
    stats,
    evidenceMarkets,
  }
}
