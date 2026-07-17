import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFeatureTable } from './featureEngineering.js'
import { deriveMarketLabels } from './markets.js'
import { predictMarkets } from './prediction.js'
import { isUpcomingFixture } from './fixtureTime.js'
import {
  buildApiFootballHistoricalTargets,
  historyDateRange,
  mapApiFootballFixture,
} from './providers/apiFootballProvider.js'
import { parseFootballDataCsv } from './providers/footballDataProvider.js'
import { trainModel } from './training.js'
import type { CsvRow } from './schemas.js'

test('deriva labels de gols a partir de FTHG e FTAG', () => {
  const [record] = buildFeatureTable([
    { Div: 'BRA', FTHG: '2', FTAG: '1', HC: '6', AC: '4', HY: '2', AY: '3' },
  ]).records

  assert.equal(record.totalGoals, 3)
  assert.equal(deriveMarketLabels(record, 'OVER_1_5_GOALS')?.labels.over_1_5, true)
  assert.equal(deriveMarketLabels(record, 'OVER_2_5_GOALS')?.labels.over_2_5, true)
  assert.equal(deriveMarketLabels(record, 'OVER_3_5_GOALS')?.labels.over_3_5, false)
  assert.equal(deriveMarketLabels(record, 'UNDER_2_5_GOALS')?.labels.under_2_5, false)
  assert.equal(deriveMarketLabels(record, 'BOTH_TEAMS_SCORE')?.labels.btts_yes, true)
})

test('deriva 1X2 e dupla chance a partir do resultado final', () => {
  const records = buildFeatureTable([
    { Div: 'A', FTHG: '2', FTAG: '1' },
    { Div: 'A', FTHG: '1', FTAG: '1' },
    { Div: 'A', FTHG: '0', FTAG: '2' },
  ]).records

  assert.deepEqual(deriveMarketLabels(records[0], '1X2')?.labels, {
    home_win: true,
    draw: false,
    away_win: false,
  })
  assert.deepEqual(deriveMarketLabels(records[1], 'DOUBLE_CHANCE')?.labels, {
    '1x': true,
    '12': false,
    x2: true,
  })
  assert.deepEqual(deriveMarketLabels(records[2], 'DOUBLE_CHANCE')?.labels, {
    '1x': false,
    '12': true,
    x2: true,
  })
})

test('cartoes e escanteios ficam indisponiveis quando colunas nao existem', () => {
  const [record] = buildFeatureTable([{ Div: 'BRA', FTHG: '0', FTAG: '0' }]).records

  assert.equal(deriveMarketLabels(record, 'CARDS'), null)
  assert.equal(deriveMarketLabels(record, 'CORNERS'), null)
})

test('predicao retorna mercados disponiveis e ignorados por liga', () => {
  const rows: CsvRow[] = [
    { Div: 'A', FTHG: '2', FTAG: '1', HC: '5', AC: '5', HY: '2', AY: '3' },
    { Div: 'A', FTHG: '1', FTAG: '1', HC: '4', AC: '3', HY: '1', AY: '2' },
    { Div: 'B', FTHG: '3', FTAG: '0' },
    { Div: 'B', FTHG: '0', FTAG: '1' },
  ]
  const featureTable = buildFeatureTable(rows)
  const model = trainModel(featureTable.records, { minRows: 2 })

  const leagueA = predictMarkets(model, { homeTeam: 'A1', awayTeam: 'A2', league: 'A' })
  const leagueB = predictMarkets(model, { homeTeam: 'B1', awayTeam: 'B2', league: 'B' })

  assert.equal(leagueA.availableMarkets.some((market) => market.market === 'CORNERS'), true)
  assert.equal(leagueA.availableMarkets.some((market) => market.market === 'CARDS'), true)
  assert.equal(leagueB.ignoredMarkets.some((market) => market.market === 'CORNERS'), true)
  assert.equal(leagueB.ignoredMarkets.some((market) => market.market === 'CARDS'), true)
})

test('predicao expoe status dados_insuficientes com motivo', () => {
  const [record] = buildFeatureTable([{ Div: 'A', FTHG: '1', FTAG: '0' }]).records
  const model = trainModel([record], { minRows: 2 })
  const response = predictMarkets(model, { homeTeam: 'A', awayTeam: 'B', league: 'A' })

  assert.equal(response.availableMarkets.length, 0)
  assert.equal(response.ignoredMarkets.every((market) => market.status === 'dados_insuficientes'), true)
  assert.equal(response.ignoredMarkets.some((market) => market.reason.length > 0), true)
  assert.equal(response.sampleSize, 1)
  assert.equal(response.confidence, 'Baixa')
})

test('predicao diferencia jogos do mesmo segmento usando perfil dos times', () => {
  const rows: CsvRow[] = [
    { Div: 'T', Competition: 'Liga Teste', Season: '2026', HomeTeam: 'Alpha', AwayTeam: 'Beta', FTHG: '4', FTAG: '0' },
    { Div: 'T', Competition: 'Liga Teste', Season: '2026', HomeTeam: 'Alpha', AwayTeam: 'Gamma', FTHG: '3', FTAG: '1' },
    { Div: 'T', Competition: 'Liga Teste', Season: '2026', HomeTeam: 'Beta', AwayTeam: 'Alpha', FTHG: '0', FTAG: '2' },
    { Div: 'T', Competition: 'Liga Teste', Season: '2026', HomeTeam: 'Delta', AwayTeam: 'Gamma', FTHG: '0', FTAG: '3' },
    { Div: 'T', Competition: 'Liga Teste', Season: '2026', HomeTeam: 'Delta', AwayTeam: 'Beta', FTHG: '0', FTAG: '2' },
    { Div: 'T', Competition: 'Liga Teste', Season: '2026', HomeTeam: 'Gamma', AwayTeam: 'Delta', FTHG: '2', FTAG: '0' },
  ]
  const model = trainModel(buildFeatureTable(rows).records, { minRows: 2 })
  const alpha = predictMarkets(model, {
    homeTeam: 'Alpha',
    awayTeam: 'Beta',
    competition: 'Liga Teste',
    season: '2026',
  }).availableMarkets.find((market) => market.market === '1X2')
  const delta = predictMarkets(model, {
    homeTeam: 'Delta',
    awayTeam: 'Gamma',
    competition: 'Liga Teste',
    season: '2026',
  }).availableMarkets.find((market) => market.market === '1X2')

  const alphaHome = alpha?.selections.find((selection) => selection.key === 'home_win')?.probability ?? 0
  const deltaHome = delta?.selections.find((selection) => selection.key === 'home_win')?.probability ?? 0

  assert.notEqual(alphaHome, deltaHome)
  assert.equal(alphaHome > deltaHome, true)
})

test('provider API-Football normaliza fixture com eventos e estatisticas', () => {
  const row = mapApiFootballFixture({
    fixture: {
      id: 100,
      date: '2026-08-11T19:00:00+00:00',
      status: { short: 'FT' },
    },
    league: { id: 39, name: 'Premier League', season: 2026, round: 'Matchweek 1' },
    teams: {
      home: { id: 10, name: 'Arsenal' },
      away: { id: 20, name: 'Everton' },
    },
    goals: { home: 2, away: 1 },
    events: [
      { type: 'Card', detail: 'Yellow Card', team: { id: 10 } },
      { type: 'Card', detail: 'Red Card', team: { id: 20 } },
    ],
    statistics: [
      { team: { id: 10 }, statistics: [{ type: 'Corner Kicks', value: 6 }] },
      { team: { id: 20 }, statistics: [{ type: 'Corner Kicks', value: 3 }] },
    ],
  })

  assert.equal(row.HomeTeam, 'Arsenal')
  assert.equal(row.AwayTeam, 'Everton')
  assert.equal(row.FTHG, '2')
  assert.equal(row.FTAG, '1')
  assert.equal(row.FTR, 'H')
  assert.equal(row.HC, '6')
  assert.equal(row.AC, '3')
  assert.equal(row.HY, '1')
  assert.equal(row.AR, '1')
  assert.equal(row.Competition, 'Premier League')
})

test('provider API-Football monta alvos historicos dos ultimos 5 anos', () => {
  const now = new Date('2026-06-25T12:00:00.000Z')
  const range = historyDateRange(5, now)
  const targets = buildApiFootballHistoricalTargets(5, now)

  assert.deepEqual(range, { from: '2021-06-25', to: '2026-06-25' })
  assert.equal(targets.some((target) => target.league === 39 && target.season === 2021), true)
  assert.equal(targets.some((target) => target.league === 39 && target.season === 2026), true)
})

test('provider API-Football preserva vencedor por penaltis sem reescrever empate', () => {
  const row = mapApiFootballFixture({
    fixture: { id: 200, date: '2026-08-15T23:00:00Z', status: { short: 'PEN' } },
    league: { id: 140, name: 'La Liga', season: 2026 },
    teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
    goals: { home: 1, away: 1 },
    score: { penalty: { home: 5, away: 4 } },
  })
  assert.equal(row.FTR, 'D')
  assert.equal(row.ResultDecision, 'penalties')
  assert.equal(row.HomePenaltyGoals, '5')
  assert.equal(row.AwayPenaltyGoals, '4')
})

test('provider Football-Data normaliza CSV historico e ignora odds no produto', () => {
  const rows = parseFootballDataCsv(
    [
      'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A',
      'E0,11/08/2025,Liverpool,Everton,3,1,H,7,4,2,1,0,0,1.50,4.00,6.00',
    ].join('\n'),
    { league: 'Premier League', season: '2025-2026' },
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0].League, 'Premier League')
  assert.equal(rows[0].Season, '2025-2026')
  assert.equal(rows[0].FTHG, '3')
  assert.equal(rows[0].HC, '7')
  assert.equal(rows[0].B365H, undefined)
  assert.equal(rows[0].SourceProvider, 'football-data.co.uk')
})

test('fixture deixa de ser exibida quando horario de inicio chega', () => {
  const now = new Date('2026-06-24T18:00:00.000Z')
  const base = {
    id: 'fixture',
    competition: 'Premier League',
    leagueId: 'PL',
    league: 'Premier League',
    season: '2026',
    date: '24 jun.',
    time: '15:00',
    status: 'NS',
    homeTeam: 'A',
    awayTeam: 'B',
    sourceProvider: 'api-football',
    updatedAt: now.toISOString(),
  }

  assert.equal(isUpcomingFixture({ ...base, isoDate: '2026-06-24T18:00:00.000Z' }, now), false)
  assert.equal(isUpcomingFixture({ ...base, isoDate: '2026-06-24T18:01:00.000Z' }, now), true)
})
