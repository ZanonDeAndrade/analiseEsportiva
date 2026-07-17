import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchFootballDataOrgHistory,
  fetchFootballDataOrgFixtures,
  FOOTBALL_DATA_ORG_TARGETS,
  mapFootballDataOrgMatch,
} from './footballDataOrgProvider.js'

test('consulta resultados encerrados da temporada para treino segmentado', async () => {
  const result = await fetchFootballDataOrgHistory({
    apiKey: 'test-key',
    target: { code: 'BSA', leagueId: 'BRA', name: 'Brasileirao Serie A' },
    season: 2026,
    fetcher: async (url) => {
      const parsed = new URL(url)
      assert.equal(parsed.pathname, '/v4/competitions/BSA/matches')
      assert.equal(parsed.searchParams.get('season'), '2026')
      assert.equal(parsed.searchParams.get('status'), 'FINISHED')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          matches: [{
            id: 77,
            utcDate: '2026-05-10T19:00:00Z',
            status: 'FINISHED',
            competition: { code: 'BSA', name: 'Série A' },
            season: { startDate: '2026-01-01', endDate: '2026-12-31' },
            homeTeam: { id: 1, name: 'Time A' },
            awayTeam: { id: 2, name: 'Time B' },
            score: { fullTime: { home: 2, away: 1 } },
          }],
        }),
      }
    },
  })

  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].Competition, 'Brasileirao Serie A')
  assert.equal(result.rows[0].FTR, 'H')
  assert.equal(result.fixtures.length, 0)
})

test('consulta as ligas alvo em uma unica chamada autenticada e preserva UTC', async () => {
  let requestedUrl = ''
  let token = ''
  const result = await fetchFootballDataOrgFixtures({
    apiKey: 'segredo-de-teste',
    from: '2026-07-16',
    to: '2026-07-23',
    fetcher: async (url, init) => {
      requestedUrl = url
      token = init?.headers?.['X-Auth-Token'] ?? ''
      return {
        ok: true,
        status: 200,
        json: async () => ({
          matches: [{
            id: 42,
            utcDate: '2026-07-18T19:30:00Z',
            status: 'TIMED',
            competition: { code: 'BSA', name: 'Campeonato Brasileiro Serie A' },
            season: { startDate: '2026-01-01', endDate: '2026-12-31' },
            matchday: 18,
            homeTeam: { id: 10, name: 'Equipe A' },
            awayTeam: { id: 20, name: 'Equipe B' },
            score: {},
          }],
        }),
      }
    },
  })

  const parsed = new URL(requestedUrl)
  assert.equal(parsed.pathname, '/v4/matches')
  assert.equal(parsed.searchParams.get('competitions'), 'BSA,PL,PD,FL1,BL1')
  assert.equal(parsed.searchParams.get('dateFrom'), '2026-07-16')
  assert.equal(token, 'segredo-de-teste')
  assert.equal(result.rows.length, 0)
  assert.equal(result.fixtures.length, 1)
  assert.equal(result.fixtures[0].isoDate, '2026-07-18T19:30:00.000Z')
  assert.equal(result.fixtures[0].homeTeamExternalId, '10')
  assert.equal(result.fixtures[0].awayTeamExternalId, '20')
  assert.equal(result.fixtures[0].sourceProvider, 'football-data-org')
})

test('partida decidida nos penaltis mantem empate regulamentar e contexto da decisao', () => {
  const mapped = mapFootballDataOrgMatch({
    id: 99,
    utcDate: '2026-07-19T20:00:00Z',
    status: 'FINISHED',
    competition: { code: 'PL', name: 'Premier League' },
    season: { startDate: '2025-08-01', endDate: '2026-05-31' },
    homeTeam: { id: 1, name: 'Equipe A' },
    awayTeam: { id: 2, name: 'Equipe B' },
    score: {
      duration: 'PENALTY_SHOOTOUT',
      regularTime: { home: 1, away: 1 },
      fullTime: { home: 1, away: 1 },
      penalties: { home: 5, away: 4 },
    },
  }, FOOTBALL_DATA_ORG_TARGETS[1], '2026-07-19T22:00:00Z')

  assert.equal(mapped.row?.FTR, 'D')
  assert.equal(mapped.row?.ResultDecision, 'penalties')
  assert.equal(mapped.row?.HomePenaltyGoals, '5')
  assert.equal(mapped.row?.AwayPenaltyGoals, '4')
})

test('erros do provedor nao viram calendario ficticio', async () => {
  await assert.rejects(
    fetchFootballDataOrgFixtures({
      apiKey: 'segredo-de-teste',
      from: '2026-07-16',
      to: '2026-07-23',
      fetcher: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    }),
    /HTTP 503/,
  )
})
