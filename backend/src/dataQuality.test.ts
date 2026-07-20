import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsvDetailed } from './csv.js'
import {
  MAX_GOALS_PER_TEAM,
  assessDataQuality,
  canonicalDate,
  compareCanonical,
} from './dataQuality.js'
import type { EngineeredMatchRecord } from './schemas.js'

test('MAX_GOALS_PER_TEAM é reexportado pela camada central', () => {
  assert.equal(MAX_GOALS_PER_TEAM, 30)
})

test('canonicalDate normaliza ISO e DD/MM/AAAA e rejeita datas inválidas', () => {
  assert.deepEqual(canonicalDate('2024-01-05'), { iso: '2024-01-05', timestamp: Date.UTC(2024, 0, 5) })
  assert.deepEqual(canonicalDate('05/01/2024'), { iso: '2024-01-05', timestamp: Date.UTC(2024, 0, 5) })
  assert.equal(canonicalDate('2024-13-40'), null) // data impossível
  assert.equal(canonicalDate('05-01-2024'), null) // formato não suportado
  assert.equal(canonicalDate(''), null)
  assert.equal(canonicalDate(undefined), null)
})

test('compareCanonical é determinístico com desempate estável', () => {
  const make = (over: Partial<EngineeredMatchRecord>): EngineeredMatchRecord => ({
    index: 0, source: {}, fullTimeHomeGoals: 1, fullTimeAwayGoals: 0, outcome: 'H', totalGoals: 1,
    date: '2024-01-01', competition: 'Liga', season: '2024', homeTeam: 'Alfa', awayTeam: 'Beta', ...over,
  })
  const a = make({ index: 2 })
  const b = make({ index: 2, homeTeam: 'Zeta' })
  const c = make({ index: 1, date: '2023-12-31' })
  assert.ok(compareCanonical(c, a) < 0) // data anterior vem antes
  assert.ok(compareCanonical(a, b) < 0) // mesmo instante -> desempate por equipe da casa
  assert.equal(compareCanonical(a, a), 0)
})

function csvRows(lines: string[]) {
  return parseCsvDetailed(lines.join('\n') + '\n')
}

const HEADER = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'

test('assessDataQuality rejeita placares, datas e integridade inválidos', () => {
  const { rows, issues } = csvRows([
    HEADER,
    'Liga,L,2024,2024-01-01,Alfa,Beta,2,1,fonteA',       // ok
    'Liga,L,2024,2024-01-02,Gama,Delta,999999,0,fonteA', // score_out_of_range
    'Liga,L,2024,2024-01-03,Alfa,Alfa,1,1,fonteA',       // same_team_both_sides
    'Liga,L,2024,data-ruim,Eta,Teta,1,0,fonteB',         // invalid_date
    'Liga,L,2024,2024-01-05,,Beta,1,0,fonteB',           // missing_home_team
    'Liga,L,2024,04/01/2024,Iota,Kapa,0,0,fonteB',       // ok (DD/MM)
  ])
  const report = assessDataQuality(rows, issues)

  assert.equal(report.accepted, 2, 'apenas 2 partidas válidas entram nos registros limpos')
  const codes = report.issues.map((issue) => issue.code)
  assert.ok(codes.includes('score_out_of_range'))
  assert.ok(codes.includes('same_team_both_sides'))
  assert.ok(codes.includes('invalid_date'))
  assert.ok(codes.includes('missing_home_team'))
  // registros limpos ordenados e com data canônica ISO
  assert.deepEqual(report.records.map((record) => record.date), ['2024-01-01', '2024-01-04'])
  // erro estruturado carrega código, linha, campo, valor, motivo e fonte
  const scoreIssue = report.issues.find((issue) => issue.code === 'score_out_of_range')
  assert.ok(scoreIssue && scoreIssue.value === '999999' && scoreIssue.source === 'fonteA' && typeof scoreIssue.row === 'number')
  assert.ok(report.problemsBySource.fonteA >= 1 && report.problemsBySource.fonteB >= 1)
})

test('assessDataQuality deduplica partidas e detecta conflito de placar', () => {
  const { rows, issues } = csvRows([
    HEADER,
    'Liga,L,2024,2024-01-01,Alfa,Beta,2,1,fonteA',
    'Liga,L,2024,2024-01-01,Alfa,Beta,2,1,fonteA', // duplicata exata
    'Liga,L,2024,2024-02-01,Gama,Delta,1,0,fonteA',
    'Liga,L,2024,2024-02-01,Gama,Delta,3,3,fonteA', // conflito de placar
  ])
  const report = assessDataQuality(rows, issues)
  assert.equal(report.duplicates, 2)
  assert.equal(report.accepted, 2, 'mantém a primeira ocorrência de cada partida')
  const codes = report.issues.map((issue) => issue.code)
  assert.ok(codes.includes('duplicate_match'))
  assert.ok(codes.includes('conflicting_match'))
})

test('assessDataQuality detecta CSV malformado e aspas não fechadas', () => {
  const { rows, issues } = parseCsvDetailed(`${HEADER}\nLiga,L,2024,2024-01-01,"Alfa,Beta,2,1,fonteA\n`)
  const report = assessDataQuality(rows, issues)
  const codes = report.issues.map((issue) => issue.code)
  assert.ok(codes.includes('unterminated_quote'))
})

test('assessDataQuality detecta colunas obrigatórias ausentes', () => {
  const { rows, issues } = csvRows(['Competition,Season,Date,HomeTeam,AwayTeam', 'Liga,2024,2024-01-01,Alfa,Beta'])
  const report = assessDataQuality(rows, issues)
  const missing = report.issues.filter((issue) => issue.code === 'missing_required_column').map((issue) => issue.field)
  assert.ok(missing.includes('FTHG'))
  assert.ok(missing.includes('FTAG'))
})
