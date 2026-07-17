import {
  MARKET_IDS,
  type BetIntelModel,
  type IgnoredMarket,
  type MarketModel,
  type PredictionConfidence,
  type PredictionRequest,
  type PredictionResponse,
  type SegmentModel,
  type MarketId,
  type TeamProfile,
} from './schemas.js'
import { marketDefinitions } from './markets.js'
import { teamKey } from './teamNames.js'
import { wilsonInterval } from './mlops.js'

export const ETHICAL_NOTICE = 'Estimativa probabilística educacional baseada em dados históricos; não é certeza nem recomendação de aposta ou financeira.'

export function predictMarkets(model: BetIntelModel, request: PredictionRequest): PredictionResponse {
  const availableMarkets: PredictionResponse['availableMarkets'] = []
  const ignoredMarkets: IgnoredMarket[] = []

  for (const market of MARKET_IDS) {
    const marketModel = model.markets[market]
    const definition = marketDefinitions[market]

    if (!marketModel || marketModel.status !== 'available') {
      ignoredMarkets.push({
        market,
        displayName: definition.displayName,
        status: 'dados_insuficientes',
        reason: marketModel?.reason ?? 'Mercado nao treinado.',
        requiredColumns: definition.requiredColumns,
        optionalColumns: definition.optionalColumns,
      })
      continue
    }

    const segment = chooseSegment(marketModel, request)

    if (!segment || segment.status !== 'available') {
      ignoredMarkets.push({
        market,
        displayName: definition.displayName,
        status: 'dados_insuficientes',
        reason:
          segment?.reason ??
          `Dados insuficientes para ${definition.displayName} no contexto informado.`,
        requiredColumns: definition.requiredColumns,
        optionalColumns: definition.optionalColumns,
      })
      continue
    }

    const probabilities = adjustedProbabilities(model, request, market, segment.probabilities)
    const modelIdentity = model as BetIntelModel & { modelVersionId?: string; datasetVersionId?: string }
    const limitations = marketLimitations(model, market, segment)

    availableMarkets.push({
      market,
      displayName: definition.displayName,
      status: 'available',
      sourceSegment: segment.segmentKey,
      sampleSize: segment.sampleSize,
      confidence: confidenceFromSample(segment.sampleSize, model.minRows),
      period: segment.period ?? model.provenance.trainingPeriod,
      modelVersion: modelIdentity.modelVersionId ?? model.provenance.artifactFingerprint,
      limitations,
      selections: definition.selections.map((selection) => ({
        ...selection,
        probability: probabilities[selection.key] ?? segment.probabilities[selection.key] ?? 0,
        uncertainty: selectionUncertainty(segment, selection.key),
      })),
    })
  }

  const contextSampleSize =
    availableMarkets.length > 0
      ? Math.max(...availableMarkets.map((market) => market.sampleSize))
      : model.trainingRows

  const modelIdentity = model as BetIntelModel & { modelVersionId?: string; datasetVersionId?: string }
  const limitations = [
    'Probabilidades refletem padrões históricos e podem mudar com novos dados.',
    'Lesões, escalações e eventos não presentes nas features não são inferidos.',
    'Mercados sem amostra suficiente permanecem como dados_insuficientes.',
  ]
  return {
    game: request,
    sourceProvider: model.sourceProviders.length > 0 ? model.sourceProviders.join(', ') : 'local-cache',
    updatedAt: model.updatedAt,
    sampleSize: contextSampleSize,
    confidence: confidenceFromSample(contextSampleSize, model.minRows),
    ethicalNotice: ETHICAL_NOTICE,
    modelVersion: modelIdentity.modelVersionId ?? model.provenance.artifactFingerprint,
    datasetVersion: modelIdentity.datasetVersionId,
    codeVersion: model.provenance.codeVersion,
    featureSetVersion: model.provenance.featureSetVersion,
    period: model.provenance.trainingPeriod,
    limitations,
    availableMarkets,
    ignoredMarkets,
  }
}

function selectionUncertainty(segment: SegmentModel, key: string) {
  const interval = wilsonInterval(segment.positiveCounts[key] ?? 0, segment.totalCounts[key] ?? segment.sampleSize)
  return {
    lower: round1(interval.lower * 100),
    upper: round1(interval.upper * 100),
    level: 0.95 as const,
    method: 'wilson' as const,
  }
}

function marketLimitations(model: BetIntelModel, market: MarketId, segment: SegmentModel) {
  const limitations = [`Segmento ${segment.segmentKey} com ${segment.sampleSize} observações.`]
  if (segment.sampleSize < model.minRows * 2) limitations.push('Amostra próxima ao mínimo; intervalo de incerteza tende a ser amplo.')
  if (market === 'CARDS' || market === 'CORNERS') limitations.push('Cobertura depende de colunas opcionais fornecidas pelas fontes.')
  return limitations
}

function adjustedProbabilities(
  model: BetIntelModel,
  request: PredictionRequest,
  market: MarketId,
  base: Record<string, number>,
): Record<string, number> {
  const home = teamProfile(model, request.homeTeam)
  const away = teamProfile(model, request.awayTeam)

  if (!home && !away) return base

  if (market === '1X2') return adjusted1x2(base, home, away)
  if (market === 'DOUBLE_CHANCE') {
    const result = adjusted1x2(
      {
        home_win: base['1x'] !== undefined ? Math.min(95, base['1x'] * 0.55) : 40,
        draw: base['1x'] !== undefined && base.x2 !== undefined ? Math.max(5, base['1x'] + base.x2 - 100) : 30,
        away_win: base.x2 !== undefined ? Math.min(95, base.x2 * 0.55) : 30,
      },
      home,
      away,
    )

    return {
      '1x': round1(result.home_win + result.draw),
      '12': round1(result.home_win + result.away_win),
      x2: round1(result.draw + result.away_win),
    }
  }

  if (market === 'OVER_1_5_GOALS') return binaryPair('over_1_5', 'under_or_equal_1_5', adjustedOver(base.over_1_5, home, away, 1.5))
  if (market === 'OVER_2_5_GOALS') return binaryPair('over_2_5', 'under_or_equal_2_5', adjustedOver(base.over_2_5, home, away, 2.5))
  if (market === 'OVER_3_5_GOALS') return binaryPair('over_3_5', 'under_or_equal_3_5', adjustedOver(base.over_3_5, home, away, 3.5))
  if (market === 'UNDER_2_5_GOALS') return binaryPair('under_2_5', 'over_or_equal_2_5', 100 - adjustedOver(100 - base.under_2_5, home, away, 2.5))
  if (market === 'UNDER_3_5_GOALS') return binaryPair('under_3_5', 'over_or_equal_3_5', 100 - adjustedOver(100 - base.under_3_5, home, away, 3.5))
  if (market === 'BOTH_TEAMS_SCORE') return binaryPair('btts_yes', 'btts_no', adjustedBtts(base.btts_yes, home, away))
  if (market === 'CORNERS') {
    return {
      corners_over_8_5: adjustedOptionalRate(base.corners_over_8_5, home, away, 'cornersRows', 'cornersOver85'),
      corners_over_9_5: adjustedOptionalRate(base.corners_over_9_5, home, away, 'cornersRows', 'cornersOver95'),
    }
  }
  if (market === 'CARDS') {
    return {
      cards_over_3_5: adjustedOptionalRate(base.cards_over_3_5, home, away, 'cardsRows', 'cardsOver35'),
      cards_over_4_5: adjustedOptionalRate(base.cards_over_4_5, home, away, 'cardsRows', 'cardsOver45'),
      cards_over_5_5: adjustedOptionalRate(base.cards_over_5_5, home, away, 'cardsRows', 'cardsOver55'),
    }
  }

  return base
}

function adjusted1x2(base: Record<string, number>, home?: TeamProfile, away?: TeamProfile) {
  const baseHome = percent(base.home_win, 40)
  const baseDraw = percent(base.draw, 30)
  const baseAway = percent(base.away_win, 30)
  const homeWeight = profileWeight(home)
  const awayWeight = profileWeight(away)
  const profileBlend = Math.min(0.5, (homeWeight + awayWeight) / 2)
  const homeAttack = avgGoals(home, 'homeGoalsFor', 'homeMatches', 'goalsFor', 'matches')
  const awayDefense = avgGoals(away, 'awayGoalsAgainst', 'awayMatches', 'goalsAgainst', 'matches')
  const awayAttack = avgGoals(away, 'awayGoalsFor', 'awayMatches', 'goalsFor', 'matches')
  const homeDefense = avgGoals(home, 'homeGoalsAgainst', 'homeMatches', 'goalsAgainst', 'matches')
  const matchupDelta = clampUnit(((homeAttack + awayDefense) - (awayAttack + homeDefense)) / 4)
  const closeness = 1 - Math.min(1, Math.abs(matchupDelta) * 2)

  const profileHome = blendRates([
    sideRate(home, 'homeWins', 'homeMatches', 'wins', 'matches'),
    sideRate(away, 'awayLosses', 'awayMatches', 'losses', 'matches'),
  ], baseHome)
  const profileAway = blendRates([
    sideRate(away, 'awayWins', 'awayMatches', 'wins', 'matches'),
    sideRate(home, 'homeLosses', 'homeMatches', 'losses', 'matches'),
  ], baseAway)
  const profileDraw = blendRates([
    sideRate(home, 'homeDraws', 'homeMatches', 'draws', 'matches'),
    sideRate(away, 'awayDraws', 'awayMatches', 'draws', 'matches'),
  ], baseDraw)

  const rawHome = baseHome * (1 - profileBlend) + profileHome * profileBlend + matchupDelta * 12
  const rawAway = baseAway * (1 - profileBlend) + profileAway * profileBlend - matchupDelta * 12
  const rawDraw = baseDraw * (1 - profileBlend) + profileDraw * profileBlend + closeness * 5

  return normalizeTriple({
    home_win: Math.max(3, rawHome),
    draw: Math.max(3, rawDraw),
    away_win: Math.max(3, rawAway),
  })
}

function adjustedOver(baseValue: number | undefined, home: TeamProfile | undefined, away: TeamProfile | undefined, line: 1.5 | 2.5 | 3.5) {
  const base = percent(baseValue, line === 1.5 ? 70 : line === 2.5 ? 48 : 28)
  const key = line === 1.5 ? 'over15' : line === 2.5 ? 'over25' : 'over35'
  const profileRate = blendRates([rate(home?.[key], home?.matches), rate(away?.[key], away?.matches)], base)
  const expectedGoals = expectedMatchGoals(home, away)
  const expectedAdjustment = line === 1.5 ? (expectedGoals - 2.1) * 9 : line === 2.5 ? (expectedGoals - 2.6) * 12 : (expectedGoals - 3.1) * 13
  // Partial pooling: taxas por time e o ajuste de gols encolhem para a taxa do
  // segmento. Isso reduz sobreajuste em times com pouco historico.
  const weight = Math.min(0.05, (profileWeight(home) + profileWeight(away)) / 2)

  return clampPercent(base * (1 - weight) + profileRate * weight + expectedAdjustment * weight)
}

function adjustedBtts(baseValue: number | undefined, home: TeamProfile | undefined, away: TeamProfile | undefined) {
  const base = percent(baseValue, 52)
  const profileRate = blendRates(
    [rate(home?.bothTeamsScore, home?.matches), rate(away?.bothTeamsScore, away?.matches)],
    base,
  )
  const homeExpected = avgGoals(home, 'homeGoalsFor', 'homeMatches', 'goalsFor', 'matches')
  const awayExpected = avgGoals(away, 'awayGoalsFor', 'awayMatches', 'goalsFor', 'matches')
  const expectedAdjustment = (Math.min(homeExpected, awayExpected) - 1.05) * 14
  const weight = Math.min(0.05, (profileWeight(home) + profileWeight(away)) / 2)

  return clampPercent(base * (1 - weight) + profileRate * weight + expectedAdjustment * weight)
}

function adjustedOptionalRate(
  baseValue: number | undefined,
  home: TeamProfile | undefined,
  away: TeamProfile | undefined,
  rowsKey: 'cornersRows' | 'cardsRows',
  positiveKey: 'cornersOver85' | 'cornersOver95' | 'cardsOver35' | 'cardsOver45' | 'cardsOver55',
) {
  const base = percent(baseValue, 50)
  const profileRate = blendRates([rate(home?.[positiveKey], home?.[rowsKey]), rate(away?.[positiveKey], away?.[rowsKey])], base)
  const weight = Math.min(0.35, (profileWeight(home) + profileWeight(away)) / 2)

  return clampPercent(base * (1 - weight) + profileRate * weight)
}

function teamProfile(model: BetIntelModel, team: string | undefined) {
  if (!team) return undefined
  return model.teamProfiles?.[teamKey(team)]
}

function binaryPair(positiveKey: string, negativeKey: string, positive: number) {
  const clamped = clampPercent(positive)
  return { [positiveKey]: clamped, [negativeKey]: round1(100 - clamped) }
}

function normalizeTriple(values: Record<'home_win' | 'draw' | 'away_win', number>) {
  const total = values.home_win + values.draw + values.away_win
  if (total <= 0) return { home_win: 33.3, draw: 33.3, away_win: 33.4 }

  const homeWin = round1((values.home_win / total) * 100)
  const draw = round1((values.draw / total) * 100)
  return {
    home_win: homeWin,
    draw,
    away_win: round1(100 - homeWin - draw),
  }
}

function expectedMatchGoals(home: TeamProfile | undefined, away: TeamProfile | undefined) {
  const homeAttack = avgGoals(home, 'homeGoalsFor', 'homeMatches', 'goalsFor', 'matches')
  const awayDefense = avgGoals(away, 'awayGoalsAgainst', 'awayMatches', 'goalsAgainst', 'matches')
  const awayAttack = avgGoals(away, 'awayGoalsFor', 'awayMatches', 'goalsFor', 'matches')
  const homeDefense = avgGoals(home, 'homeGoalsAgainst', 'homeMatches', 'goalsAgainst', 'matches')

  return Math.max(0.4, (homeAttack + awayDefense + awayAttack + homeDefense) / 2)
}

function avgGoals(
  profile: TeamProfile | undefined,
  sideGoalsKey: 'homeGoalsFor' | 'homeGoalsAgainst' | 'awayGoalsFor' | 'awayGoalsAgainst',
  sideRowsKey: 'homeMatches' | 'awayMatches',
  allGoalsKey: 'goalsFor' | 'goalsAgainst',
  allRowsKey: 'matches',
) {
  const side = rateValue(profile?.[sideGoalsKey], profile?.[sideRowsKey])
  if (side !== undefined) return side
  return rateValue(profile?.[allGoalsKey], profile?.[allRowsKey]) ?? 1.2
}

function sideRate(
  profile: TeamProfile | undefined,
  sidePositiveKey: 'homeWins' | 'homeDraws' | 'homeLosses' | 'awayWins' | 'awayDraws' | 'awayLosses',
  sideRowsKey: 'homeMatches' | 'awayMatches',
  allPositiveKey: 'wins' | 'draws' | 'losses',
  allRowsKey: 'matches',
) {
  const side = rate(profile?.[sidePositiveKey], profile?.[sideRowsKey])
  if (side !== undefined) return side
  return rate(profile?.[allPositiveKey], profile?.[allRowsKey])
}

function profileWeight(profile: TeamProfile | undefined) {
  if (!profile) return 0
  return Math.min(0.5, profile.matches / 20)
}

function blendRates(values: Array<number | undefined>, fallback: number) {
  const valid = values.filter((value): value is number => value !== undefined)
  if (valid.length === 0) return fallback
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function rate(positive: number | undefined, total: number | undefined) {
  if (!total || total <= 0 || positive === undefined) return undefined
  return (positive / total) * 100
}

function rateValue(sum: number | undefined, total: number | undefined) {
  if (!total || total <= 0 || sum === undefined) return undefined
  return sum / total
}

function percent(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback
}

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value))
}

function clampPercent(value: number) {
  return round1(Math.max(1, Math.min(99, value)))
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

export function confidenceFromSample(sampleSize: number, minRows: number): PredictionConfidence {
  if (sampleSize >= minRows * 5) return 'Alta'
  if (sampleSize >= minRows * 2) return 'Media'
  return 'Baixa'
}

function chooseSegment(marketModel: MarketModel, request: PredictionRequest): SegmentModel | undefined {
  const candidates = [
    request.competition && request.season ? `${request.competition}::${request.season}` : undefined,
    request.competition ? `competition:${request.competition}` : undefined,
    request.competition,
    request.league && request.season ? `${request.league}::${request.season}` : undefined,
    request.league,
    request.season ? `season:${request.season}` : undefined,
  ].filter((value): value is string => Boolean(value))

  for (const key of candidates) {
    const segment = marketModel.segments[key]
    if (segment) return segment
  }

  if (candidates.length > 0) return undefined

  return marketModel.global
}
