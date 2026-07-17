import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from './csv.js'
import { buildFeatureTable } from './featureEngineering.js'
import { temporalSplit } from './mlops.js'
import type { EngineeredMatchRecord } from './schemas.js'

interface RowSpec {
  competition: string
  date: string
  home?: number
  away?: number
}

/** Constroi registros reais via buildFeatureTable a partir de uma lista de linhas. */
function makeRecords(rows: RowSpec[]): EngineeredMatchRecord[] {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const lines = [
    header,
    ...rows.map((row, index) =>
      `${row.competition},L,2026,${row.date},Casa${index},Fora${index},${row.home ?? index % 4},${row.away ?? index % 3},test`,
    ),
  ]
  return buildFeatureTable(parseCsv(lines.join('\n'))).records
}

function isoDay(offset: number): string {
  return new Date(Date.UTC(2024, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10)
}

function indexSet(records: EngineeredMatchRecord[]): Set<number> {
  return new Set(records.map((record) => record.index))
}

test('dataset fora de ordem: a divisão ordena por data e mantém treino antes do teste', () => {
  const offsets = [7, 2, 9, 0, 5, 1, 8, 3, 6, 4]
  const records = makeRecords(offsets.map((offset) => ({ competition: 'Liga', date: isoDay(offset) })))
  const split = temporalSplit(records)

  const trainDates = split.train.map((record) => record.date!).sort()
  const testDates = split.test.map((record) => record.date!).sort()
  assert.ok(trainDates.at(-1)! < testDates[0], 'todo treino é anterior a todo teste na mesma competição')
  assert.equal(split.report.competitions.length, 1)
  assert.equal(split.report.competitions[0].total, 10)
})

test('várias competições representadas em treino e teste (contagens por competição)', () => {
  const rows: RowSpec[] = []
  for (const competition of ['Brasileirao', 'Premier', 'La Liga']) {
    for (let day = 0; day < 10; day += 1) rows.push({ competition, date: isoDay(day) })
  }
  const split = temporalSplit(makeRecords(rows))

  assert.equal(split.report.competitions.length, 3)
  for (const competition of split.report.competitions) {
    assert.ok(competition.train > 0, `${competition.competition} deve ter treino`)
    assert.ok(competition.test > 0, `${competition.competition} deve ter teste`)
    assert.equal(competition.train + competition.validation + competition.test, competition.total)
  }
  const trainCompetitions = new Set(split.train.map((record) => record.competition))
  const testCompetitions = new Set(split.test.map((record) => record.competition))
  for (const competition of ['Brasileirao', 'Premier', 'La Liga']) {
    assert.ok(trainCompetitions.has(competition))
    assert.ok(testCompetitions.has(competition))
  }
})

test('competição com poucas linhas é tratada sem erro', () => {
  const rows: RowSpec[] = [
    { competition: 'Grande', date: isoDay(0) },
    { competition: 'Grande', date: isoDay(1) },
    { competition: 'Grande', date: isoDay(2) },
    { competition: 'Grande', date: isoDay(3) },
    { competition: 'Grande', date: isoDay(4) },
    { competition: 'Dupla', date: isoDay(0) },
    { competition: 'Dupla', date: isoDay(1) },
    { competition: 'Solo', date: isoDay(0) },
  ]
  const split = temporalSplit(makeRecords(rows))
  const byName = new Map(split.report.competitions.map((item) => [item.competition, item]))

  // 2 linhas -> 1 treino / 1 teste; 1 linha -> tudo treino, 0 teste (sem erro).
  assert.deepEqual(
    { train: byName.get('Dupla')!.train, test: byName.get('Dupla')!.test },
    { train: 1, test: 1 },
  )
  assert.deepEqual(
    { train: byName.get('Solo')!.train, test: byName.get('Solo')!.test },
    { train: 1, test: 0 },
  )
})

test('datas em formatos mistos (ISO e DD/MM/AAAA) são normalizadas sem descarte', () => {
  const rows: RowSpec[] = [
    { competition: 'Mista', date: '2024-01-01' },
    { competition: 'Mista', date: '02/01/2024' },
    { competition: 'Mista', date: '2024-01-03' },
    { competition: 'Mista', date: '04/01/2024' },
    { competition: 'Mista', date: '2024-01-05' },
  ]
  const split = temporalSplit(makeRecords(rows))

  assert.equal(split.report.discardedRows, 0)
  assert.equal(split.train.length + split.validation.length + split.test.length, 5)
  // partições reportam datas em ISO (YYYY-MM-DD) já normalizadas e ordenadas.
  assert.match(split.report.train.from, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(split.report.train.to < split.report.test.from)
})

test('linhas com data inválida ou ausente são descartadas e contadas', () => {
  const records = makeRecords([
    { competition: 'Liga', date: '2024-01-01' },
    { competition: 'Liga', date: '2024-01-02' },
    { competition: 'Liga', date: '2024-01-03' },
    { competition: 'Liga', date: 'data-invalida' },
    { competition: 'Liga', date: '2024-01-05' },
  ])
  const split = temporalSplit(records)
  assert.equal(split.report.discardedRows, 1)
  assert.equal(split.train.length + split.validation.length + split.test.length, 4)
})

test('nenhuma sobreposição: treino, validação e teste são disjuntos e cobrem os dados válidos', () => {
  const rows: RowSpec[] = []
  for (const competition of ['A', 'B']) {
    for (let day = 0; day < 12; day += 1) rows.push({ competition, date: isoDay(day) })
  }
  const split = temporalSplit(makeRecords(rows), { validationRatio: 0.2, testRatio: 0.2 })
  const train = indexSet(split.train)
  const validation = indexSet(split.validation)
  const test = indexSet(split.test)

  for (const index of test) assert.ok(!train.has(index) && !validation.has(index))
  for (const index of validation) assert.ok(!train.has(index))
  assert.equal(train.size + validation.size + test.size, 24)
})

test('resultado determinístico: mesma entrada produz exatamente o mesmo split', () => {
  const rows: RowSpec[] = []
  for (const competition of ['A', 'B', 'C']) {
    for (let day = 0; day < 8; day += 1) rows.push({ competition, date: isoDay(day) })
  }
  const first = temporalSplit(makeRecords(rows))
  const second = temporalSplit(makeRecords(rows))
  assert.deepEqual(second.report, first.report)
  assert.deepEqual(
    second.test.map((record) => record.index),
    first.test.map((record) => record.index),
  )
})
