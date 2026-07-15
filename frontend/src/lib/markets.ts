/* Market definitions and probability derivation.

   The match list shows different columns depending on the selected market.
   Base probabilities live on each Match; everything else (unders, over 3.5,
   double-chance variants, simulated cards/corners) is derived here — ported
   from the original design logic so the numbers match exactly. */

import type { Match } from '../types'

export interface MarketColumn {
  key: string
  label: string
}

/** Every market the sidebar can select, with its short category tag. */
export const MARKETS: { name: string; tag: string }[] = [
  { name: '1X2', tag: 'Núcleo' },
  { name: 'Over 1.5 gols', tag: 'Gols' },
  { name: 'Over 2.5 gols', tag: 'Gols' },
  { name: 'Over 3.5 gols', tag: 'Gols' },
  { name: 'Under 2.5 gols', tag: 'Gols' },
  { name: 'Under 3.5 gols', tag: 'Gols' },
  { name: 'Ambas Marcam', tag: 'BTTS' },
  { name: 'Dupla Chance', tag: 'Núcleo' },
  { name: 'Cartões', tag: 'Disc.' },
  { name: 'Escanteios', tag: 'Set' },
]

const COLUMN_DEFS: Record<string, [string, string][]> = {
  '1X2': [['casa', 'Casa'], ['empate', 'Empate'], ['fora', 'Fora']],
  'Over 1.5 gols': [['over15', '+1.5'], ['under15', '−1.5']],
  'Over 2.5 gols': [['over25', '+2.5'], ['under25', '−2.5']],
  'Over 3.5 gols': [['over35', '+3.5'], ['under35', '−3.5']],
  'Under 2.5 gols': [['under25', '−2.5'], ['over25', '+2.5']],
  'Under 3.5 gols': [['under35', '−3.5'], ['over35', '+3.5']],
  'Ambas Marcam': [['ambasSim', 'Sim'], ['ambasNao', 'Não']],
  'Dupla Chance': [['dc1x', '1X'], ['dc12', '12'], ['dcx2', 'X2']],
  'Cartões': [['c35', '+3.5'], ['c45', '+4.5'], ['c55', '+5.5']],
  'Escanteios': [['e85', '+8.5'], ['e95', '+9.5'], ['e105', '+10.5']],
}

export function marketDef(market: string): MarketColumn[] {
  return (COLUMN_DEFS[market] ?? COLUMN_DEFS['1X2']).map(([key, label]) => ({ key, label }))
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function clamp(v: number): number {
  return Math.max(8, Math.min(96, Math.round(v)))
}

/** All market percentages for a fixture, keyed by column key. */
export function derivedProbs(m: Match): Record<string, number | undefined> {
  const backendValues = derivedBackendProbs(m)
  if (backendValues) return backendValues

  const p = m.probabilities
  const o35 = p.over25 === undefined ? undefined : clamp(p.over25 * 0.62)
  const off = (n: number) => (hash(m.id + n) % 9) - 4
  return {
    casa: p.homeWin,
    empate: p.draw,
    fora: p.awayWin,
    over15: p.over15,
    under15: complement(p.over15),
    over25: p.over25,
    under25: complement(p.over25),
    over35: o35,
    under35: complement(o35),
    ambasSim: p.bothTeamsScore,
    ambasNao: complement(p.bothTeamsScore),
    dc1x: sumCapped(96, p.homeWin, p.draw),
    dc12: sumCapped(97, p.homeWin, p.awayWin),
    dcx2: sumCapped(96, p.draw, p.awayWin),
    c35: clamp(71 + off(1)),
    c45: clamp(54 + off(2)),
    c55: clamp(37 + off(3)),
    e85: clamp(73 + off(4)),
    e95: clamp(57 + off(5)),
    e105: clamp(41 + off(6)),
  }
}

function complement(value: number | undefined) {
  return value === undefined ? undefined : 100 - value
}

function sumCapped(cap: number, left: number | undefined, right: number | undefined) {
  return left === undefined || right === undefined ? undefined : Math.min(cap, left + right)
}

function derivedBackendProbs(m: Match): Record<string, number | undefined> | null {
  if (!m.availableMarkets) return null

  const byMarket = (marketId: string, selectionKey: string) =>
    m.availableMarkets
      ?.find((market) => market.market === marketId)
      ?.selections.find((selection) => selection.key === selectionKey)?.probability

  return {
    casa: byMarket('1X2', 'home_win'),
    empate: byMarket('1X2', 'draw'),
    fora: byMarket('1X2', 'away_win'),
    over15: byMarket('OVER_1_5_GOALS', 'over_1_5'),
    under15: byMarket('OVER_1_5_GOALS', 'under_or_equal_1_5'),
    over25: byMarket('OVER_2_5_GOALS', 'over_2_5'),
    under25: byMarket('UNDER_2_5_GOALS', 'under_2_5'),
    over35: byMarket('OVER_3_5_GOALS', 'over_3_5'),
    under35: byMarket('UNDER_3_5_GOALS', 'under_3_5'),
    ambasSim: byMarket('BOTH_TEAMS_SCORE', 'btts_yes'),
    ambasNao: byMarket('BOTH_TEAMS_SCORE', 'btts_no'),
    dc1x: byMarket('DOUBLE_CHANCE', '1x'),
    dc12: byMarket('DOUBLE_CHANCE', '12'),
    dcx2: byMarket('DOUBLE_CHANCE', 'x2'),
    c35: byMarket('CARDS', 'cards_over_3_5'),
    c45: byMarket('CARDS', 'cards_over_4_5'),
    c55: byMarket('CARDS', 'cards_over_5_5'),
    e85: byMarket('CORNERS', 'corners_over_8_5'),
    e95: byMarket('CORNERS', 'corners_over_9_5'),
    e105: undefined,
  }
}
