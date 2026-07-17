import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from './csv.js'
import { buildFeatureTable } from './featureEngineering.js'
import { prepareSportsImportBatch } from './import/localStateImporter.js'
import {
  MAX_GOALS_PER_TEAM,
  validateGoalScore,
  type ScoreRejectionCode,
} from './scoreValidation.js'

test('MAX_GOALS_PER_TEAM define o limite plausivel', () => {
  assert.equal(MAX_GOALS_PER_TEAM, 30)
})

test('validateGoalScore aceita placares legitimos (0, 1, 9, 30)', () => {
  for (const value of ['0', '1', '9', '30']) {
    const result = validateGoalScore(value, 'FTHG', 'home')
    assert.equal(result.ok, true, `esperava aceitar "${value}"`)
    if (result.ok) assert.equal(result.value, Number(value))
  }
})

test('validateGoalScore rejeita valores invalidos com o codigo correto', () => {
  const cases: Array<{ raw: string | undefined; side: 'home' | 'away'; code: ScoreRejectionCode }> = [
    { raw: '-1', side: 'home', code: 'score_out_of_range' },
    { raw: '2.5', side: 'home', code: 'fractional_score' },
    { raw: '31', side: 'home', code: 'score_out_of_range' },
    { raw: '999999', side: 'home', code: 'score_out_of_range' },
    { raw: 'NaN', side: 'home', code: 'invalid_home_score' },
    { raw: '', side: 'home', code: 'invalid_home_score' },
    { raw: 'abc', side: 'home', code: 'invalid_home_score' },
    { raw: undefined, side: 'home', code: 'invalid_home_score' },
    { raw: 'x', side: 'away', code: 'invalid_away_score' },
    { raw: '-1', side: 'away', code: 'score_out_of_range' },
    { raw: '2.5', side: 'away', code: 'fractional_score' },
  ]

  for (const item of cases) {
    const result = validateGoalScore(item.raw, item.side === 'home' ? 'FTHG' : 'FTAG', item.side)
    assert.equal(result.ok, false, `esperava rejeitar "${String(item.raw)}"`)
    if (!result.ok) {
      assert.equal(result.rejection.code, item.code, `codigo errado para "${String(item.raw)}"`)
      assert.equal(result.rejection.value, item.raw ?? '')
    }
  }
})

test('buildFeatureTable descarta linhas invalidas e preserva placares plausiveis', () => {
  const csv = [
    'Date,HomeTeam,AwayTeam,FTHG,FTAG',
    '2024-01-01,A,B,0,0',        // valido: 0-0
    '2024-01-02,A,B,30,2',       // valido: alto porem plausivel
    '2024-01-03,A,B,-1,1',       // score_out_of_range (FTHG)
    '2024-01-04,A,B,2.5,1',      // fractional_score (FTHG)
    '2024-01-05,A,B,999999,1',   // score_out_of_range (FTHG)
    '2024-01-06,A,B,x,1',        // invalid_home_score (FTHG)
    '2024-01-07,A,B,1,-1',       // score_out_of_range (FTAG)
    '2024-01-08,A,B,1,y',        // invalid_away_score (FTAG)
  ].join('\n')

  const report = buildFeatureTable(parseCsv(csv))

  assert.equal(report.records.length, 2, 'apenas as duas linhas validas entram no dataset')
  assert.deepEqual(
    report.records.map((record) => record.totalGoals),
    [0, 32],
  )

  assert.equal(report.rejectedRows.length, 6)
  const codes = report.rejectedRows.map((row) => row.code)
  assert.deepEqual(codes, [
    'score_out_of_range',
    'fractional_score',
    'score_out_of_range',
    'invalid_home_score',
    'score_out_of_range',
    'invalid_away_score',
  ])
  // Numero da linha e valor recebido presentes na rejeicao.
  const outOfRange = report.rejectedRows.find((row) => row.value === '999999')
  assert.ok(outOfRange)
  assert.equal(outOfRange.field, 'FTHG')
  assert.equal(outOfRange.index, 4)
  assert.match(outOfRange.reason, /999999/)
})

test('prepareSportsImportBatch rejeita placar absurdo e registra o motivo estruturado', () => {
  const base = { SourceProvider: 'football-data', Competition: 'Liga', Div: 'L', Season: '2024' }
  const rows = [
    { ...base, Date: '2024-01-01', HomeTeam: 'A', AwayTeam: 'B', FTHG: '2', FTAG: '1' },
    { ...base, Date: '2024-01-02', HomeTeam: 'C', AwayTeam: 'D', FTHG: '999999', FTAG: '1' },
    { ...base, Date: '2024-01-03', HomeTeam: 'E', AwayTeam: 'F', FTHG: '2.5', FTAG: '0' },
  ]

  const { batch, issues } = prepareSportsImportBatch({ rows, fixtures: [], datasetKey: 'score-test' })

  assert.equal(batch.records.length, 1, 'apenas a linha valida e importada')
  const codes = issues.map((item) => item.code)
  assert.ok(codes.includes('score_out_of_range'), 'placar 999999 deve virar score_out_of_range')
  assert.ok(codes.includes('fractional_score'), 'placar 2.5 deve virar fractional_score')
  const outOfRange = issues.find((item) => item.code === 'score_out_of_range')
  assert.ok(outOfRange)
  assert.equal(outOfRange.row, 2)
  assert.match(outOfRange.message, /999999/)
})
