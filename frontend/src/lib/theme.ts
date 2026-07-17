/* Inline style helpers for the value-driven bits of the UI
   (chip colors, league dots, confidence seals). Static layout lives in CSS
   Modules; only the parts that depend on data values are computed here. */

import type { CSSProperties } from 'react'
import type { Confidence, LeagueId, Result } from '../types'

/** League accent dots — the small colored markers next to each league. */
export const LEAGUE_COLOR: Record<LeagueId, string> = {
  BRA: '#3bd17a',
  PL: '#6c8cff',
  LL: '#e0a92e',
  L1: '#4ec3e0',
  BUN: '#e0524e',
}

export function dotColor(lg: LeagueId): string {
  return LEAGUE_COLOR[lg] ?? '#6b727c'
}

/** Form chip (V / E / D) — green / grey / red square badge. */
export function formChipStyle(letter: Result): CSSProperties {
  const map: Record<Result, { bg: string; c: string }> = {
    V: { bg: '#2fbd6b', c: '#0a1810' },
    E: { bg: '#454c56', c: '#cfd4da' },
    D: { bg: '#e0524e', c: '#fff' },
  }
  const m = map[letter] ?? map.E
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 17,
    height: 17,
    borderRadius: 4,
    fontSize: 9.5,
    fontWeight: 700,
    color: m.c,
    background: m.bg,
    flexShrink: 0,
  }
}

/** Confidence seal — Alta (green) / Média (amber) / Baixa (red) pill. */
export function confChipStyle(level: Confidence): CSSProperties {
  const map: Record<Confidence, { bg: string; bd: string; c: string }> = {
    Alta: { bg: 'rgba(47,189,107,.14)', bd: 'rgba(47,189,107,.4)', c: '#3bd17a' },
    Média: { bg: 'rgba(224,169,46,.14)', bd: 'rgba(224,169,46,.4)', c: '#e0a92e' },
    Baixa: { bg: 'rgba(224,82,78,.14)', bd: 'rgba(224,82,78,.4)', c: '#ec6b67' },
  }
  const m = map[level] ?? map['Média']
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 9px',
    borderRadius: 6,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    background: m.bg,
    border: '1px solid ' + m.bd,
    color: m.c,
    whiteSpace: 'nowrap',
  }
}

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  Alta: 'Alto',
  Média: 'Médio',
  Baixa: 'Baixo',
}
