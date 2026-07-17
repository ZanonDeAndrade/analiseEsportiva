import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareSportsImportBatch } from './localStateImporter.js'
import type { CsvRow, FixtureRecord } from '../schemas.js'

const baseRow: CsvRow = {
  SourceProvider: 'provider-test',
  ExternalFixtureId: 'fixture-1',
  Div: 'TST',
  Competition: 'Liga Teste',
  Season: '2026',
  Date: '2026-07-15T20:00:00-03:00',
  HomeTeam: 'Equipe A',
  AwayTeam: 'Equipe B',
  FTHG: '1',
  FTAG: '1',
  FTR: 'D',
  UpdatedAt: '2026-07-15T23:05:00Z',
}

test('ingestao e idempotente dentro do lote por provedor e identificador externo', () => {
  const prepared = prepareSportsImportBatch({
    rows: [baseRow, { ...baseRow }], fixtures: [], datasetKey: 'test',
  })
  assert.equal(prepared.batch.records.length, 1)
  assert.equal(prepared.batch.duplicateRows, 1)
  assert.equal(prepared.issues.some((issue) => issue.code === 'duplicate'), true)
})

test('alias ambiguo e rejeitado para revisao em vez de ser associado silenciosamente', () => {
  const prepared = prepareSportsImportBatch({
    rows: [
      { ...baseRow, ExternalFixtureId: 'a', HomeTeam: 'São Paulo', HomeTeamExternalId: '10' },
      { ...baseRow, ExternalFixtureId: 'b', HomeTeam: 'Sao Paulo', HomeTeamExternalId: '99', AwayTeam: 'Equipe C' },
    ],
    fixtures: [], datasetKey: 'test',
  })
  assert.equal(prepared.batch.ambiguousRows, 1)
  assert.equal(prepared.issues.some((issue) => issue.code === 'ambiguous_team_alias'), true)
  assert.equal(prepared.batch.records.length, 0)
})

test('placar decidido nos penaltis preserva empate e contexto da disputa', () => {
  const prepared = prepareSportsImportBatch({
    rows: [{
      ...baseRow,
      ResultDecision: 'penalties',
      HomePenaltyGoals: '5',
      AwayPenaltyGoals: '4',
      RawStatus: 'PEN',
    }],
    fixtures: [], datasetKey: 'test',
  })
  assert.deepEqual(prepared.batch.records[0].result, {
    homeGoals: 1,
    awayGoals: 1,
    decision: 'penalties',
    homeExtraTimeGoals: undefined,
    awayExtraTimeGoals: undefined,
    homePenaltyGoals: 5,
    awayPenaltyGoals: 4,
    outcome: 'D',
    winner: 'home',
  })
})

test('fixtures distinguem intervalo, adiamento, cancelamento, prorrogação e disputa de penaltis', () => {
  const statuses = ['HT', 'PST', 'CANC', 'ET', 'P']
  const fixtures: FixtureRecord[] = statuses.map((status, index) => ({
    id: `fixture-${index}`,
    competition: 'Liga Teste', leagueId: 'TST', league: 'Liga Teste', season: '2026',
    date: '15 jul.', time: '20:00', isoDate: '2026-07-15T23:00:00Z', status,
    homeTeam: `Casa ${index}`, awayTeam: `Fora ${index}`,
    sourceProvider: 'provider-test', updatedAt: '2026-07-15T22:59:00Z',
  }))
  const prepared = prepareSportsImportBatch({ rows: [], fixtures, datasetKey: 'test' })
  assert.deepEqual(prepared.batch.records.map((record) => record.status), [
    'halftime', 'postponed', 'cancelled', 'extra_time', 'penalties',
  ])
})
