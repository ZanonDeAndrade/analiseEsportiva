import type {
  EngineeredMatchRecord,
  MarketDefinition,
  MarketId,
  MarketLabels,
  MatchOutcome,
} from './schemas.js'

export const marketDefinitions: Record<MarketId, MarketDefinition> = {
  '1X2': {
    id: '1X2',
    displayName: '1X2',
    category: 'result',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: ['FTR'],
    selections: [
      { key: 'home_win', label: 'Casa' },
      { key: 'draw', label: 'Empate' },
      { key: 'away_win', label: 'Fora' },
    ],
  },
  OVER_1_5_GOALS: {
    id: 'OVER_1_5_GOALS',
    displayName: 'Over 1.5 gols',
    category: 'goals',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: [],
    selections: [
      { key: 'over_1_5', label: 'Over 1.5' },
      { key: 'under_or_equal_1_5', label: 'Até 1.5' },
    ],
  },
  OVER_2_5_GOALS: {
    id: 'OVER_2_5_GOALS',
    displayName: 'Over 2.5 gols',
    category: 'goals',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: [],
    selections: [
      { key: 'over_2_5', label: 'Over 2.5' },
      { key: 'under_or_equal_2_5', label: 'Até 2.5' },
    ],
  },
  OVER_3_5_GOALS: {
    id: 'OVER_3_5_GOALS',
    displayName: 'Over 3.5 gols',
    category: 'goals',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: [],
    selections: [
      { key: 'over_3_5', label: 'Over 3.5' },
      { key: 'under_or_equal_3_5', label: 'Até 3.5' },
    ],
  },
  UNDER_2_5_GOALS: {
    id: 'UNDER_2_5_GOALS',
    displayName: 'Under 2.5 gols',
    category: 'goals',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: [],
    selections: [
      { key: 'under_2_5', label: 'Under 2.5' },
      { key: 'over_or_equal_2_5', label: '2.5+' },
    ],
  },
  UNDER_3_5_GOALS: {
    id: 'UNDER_3_5_GOALS',
    displayName: 'Under 3.5 gols',
    category: 'goals',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: [],
    selections: [
      { key: 'under_3_5', label: 'Under 3.5' },
      { key: 'over_or_equal_3_5', label: '3.5+' },
    ],
  },
  BOTH_TEAMS_SCORE: {
    id: 'BOTH_TEAMS_SCORE',
    displayName: 'Ambas Marcam',
    category: 'goals',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: [],
    selections: [
      { key: 'btts_yes', label: 'Sim' },
      { key: 'btts_no', label: 'Não' },
    ],
  },
  DOUBLE_CHANCE: {
    id: 'DOUBLE_CHANCE',
    displayName: 'Dupla Chance',
    category: 'result',
    requiredColumns: ['FTHG', 'FTAG'],
    optionalColumns: ['FTR'],
    selections: [
      { key: '1x', label: '1X' },
      { key: '12', label: '12' },
      { key: 'x2', label: 'X2' },
    ],
  },
  CARDS: {
    id: 'CARDS',
    displayName: 'Cartões',
    category: 'discipline',
    requiredColumns: [],
    optionalColumns: ['HY', 'AY', 'HR', 'AR'],
    selections: [
      { key: 'cards_over_3_5', label: 'Over 3.5 cartões' },
      { key: 'cards_over_4_5', label: 'Over 4.5 cartões' },
      { key: 'cards_over_5_5', label: 'Over 5.5 cartões' },
    ],
  },
  CORNERS: {
    id: 'CORNERS',
    displayName: 'Escanteios',
    category: 'set-pieces',
    requiredColumns: ['HC', 'AC'],
    optionalColumns: [],
    selections: [
      { key: 'corners_over_8_5', label: 'Over 8.5 escanteios' },
      { key: 'corners_over_9_5', label: 'Over 9.5 escanteios' },
    ],
  },
}

export function deriveMarketLabels(
  record: EngineeredMatchRecord,
  market: MarketId,
): MarketLabels | null {
  const outcome = record.outcome

  if (market === '1X2') {
    return {
      market,
      labels: {
        home_win: outcome === 'H',
        draw: outcome === 'D',
        away_win: outcome === 'A',
      },
      columnsUsed: ['FTHG', 'FTAG'],
    }
  }

  if (market === 'DOUBLE_CHANCE') {
    return {
      market,
      labels: {
        '1x': outcome === 'H' || outcome === 'D',
        '12': outcome === 'H' || outcome === 'A',
        x2: outcome === 'D' || outcome === 'A',
      },
      columnsUsed: ['FTHG', 'FTAG'],
    }
  }

  if (market === 'OVER_1_5_GOALS') {
    return pair(market, 'over_1_5', 'under_or_equal_1_5', record.totalGoals > 1.5, [
      'FTHG',
      'FTAG',
    ])
  }

  if (market === 'OVER_2_5_GOALS') {
    return pair(market, 'over_2_5', 'under_or_equal_2_5', record.totalGoals > 2.5, [
      'FTHG',
      'FTAG',
    ])
  }

  if (market === 'OVER_3_5_GOALS') {
    return pair(market, 'over_3_5', 'under_or_equal_3_5', record.totalGoals > 3.5, [
      'FTHG',
      'FTAG',
    ])
  }

  if (market === 'UNDER_2_5_GOALS') {
    return pair(market, 'under_2_5', 'over_or_equal_2_5', record.totalGoals < 2.5, [
      'FTHG',
      'FTAG',
    ])
  }

  if (market === 'UNDER_3_5_GOALS') {
    return pair(market, 'under_3_5', 'over_or_equal_3_5', record.totalGoals < 3.5, [
      'FTHG',
      'FTAG',
    ])
  }

  if (market === 'BOTH_TEAMS_SCORE') {
    return pair(
      market,
      'btts_yes',
      'btts_no',
      record.fullTimeHomeGoals > 0 && record.fullTimeAwayGoals > 0,
      ['FTHG', 'FTAG'],
    )
  }

  if (market === 'CORNERS') {
    if (record.totalCorners === undefined) return null

    return {
      market,
      labels: {
        corners_over_8_5: record.totalCorners > 8.5,
        corners_over_9_5: record.totalCorners > 9.5,
      },
      columnsUsed: ['HC', 'AC'],
    }
  }

  if (market === 'CARDS') {
    if (record.totalCards === undefined) return null

    return {
      market,
      labels: {
        cards_over_3_5: record.totalCards > 3.5,
        cards_over_4_5: record.totalCards > 4.5,
        cards_over_5_5: record.totalCards > 5.5,
      },
      columnsUsed: usedCardColumns(record),
    }
  }

  return null
}

export function deriveOutcome(homeGoals: number, awayGoals: number): MatchOutcome {
  if (homeGoals > awayGoals) return 'H'
  if (homeGoals < awayGoals) return 'A'
  return 'D'
}

function pair(
  market: MarketId,
  positiveKey: string,
  negativeKey: string,
  value: boolean,
  columnsUsed: string[],
): MarketLabels {
  return {
    market,
    labels: {
      [positiveKey]: value,
      [negativeKey]: !value,
    },
    columnsUsed,
  }
}

function usedCardColumns(record: EngineeredMatchRecord) {
  return [
    ['HY', record.homeYellowCards],
    ['AY', record.awayYellowCards],
    ['HR', record.homeRedCards],
    ['AR', record.awayRedCards],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([column]) => String(column))
}
