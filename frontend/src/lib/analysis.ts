/* Builds the data shown in the right-hand analysis panel for a fixture:
   the indicator grid, the "best evidence" market bars and the confidence
   labels. Ported from the original design logic. */

import type { Match } from '../types'
import { derivedProbs } from './markets'
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
  const probabilities = derivedProbs(m)

  const evidenceMarkets: EvidenceMarket[] = [
    ['Over 1.5 gols', probabilities.over15],
    ['Ambas Marcam', probabilities.ambasSim],
    ['Dupla Chance Casa/Empate', probabilities.dc1x],
    ['Under 3.5 gols', probabilities.under35],
    ['Over 2.5 gols', probabilities.over25],
  ]
    .filter((item): item is [string, number] => item[1] !== undefined)
    .map(([label, value]) => ({ label, value, valueText: '', strong: false }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((bm) => ({
      label: bm.label,
      value: bm.value,
      valueText: bm.value + '%',
      strong: bm.value >= 65,
    }))

  const stats: StatItem[] = [
    { label: 'Média de gols · mandante', value: decimal(s.homeAvgGoalsFor), strong: (s.homeAvgGoalsFor ?? 0) >= 2 },
    { label: 'Média de gols · visitante', value: decimal(s.awayAvgGoalsFor), strong: (s.awayAvgGoalsFor ?? 0) >= 2 },
    { label: 'Over 1.5 · últimos jogos', value: percent(p.over15), strong: (p.over15 ?? 0) >= 75 },
    { label: 'Over 2.5 · últimos jogos', value: percent(p.over25), strong: (p.over25 ?? 0) >= 60 },
    { label: 'Ambas Marcam · histórico', value: percent(p.bothTeamsScore), strong: (p.bothTeamsScore ?? 0) >= 60 },
    { label: 'Clean sheets · últimos 5', value: s.cleanSheets === undefined ? 'n/d' : `${s.cleanSheets}/5`, strong: false },
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

function decimal(value: number | undefined) {
  return value === undefined ? 'n/d' : value.toFixed(1)
}

function percent(value: number | undefined) {
  return value === undefined ? 'n/d' : `${value}%`
}
