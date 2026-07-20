import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from './csv.js'
import { assessDataQuality } from './dataQuality.js'
import { temporalThreeWaySplit, walkForwardFolds } from './temporalValidation.js'
import type { EngineeredMatchRecord } from './schemas.js'

function isoDay(offset: number) {
  return new Date(Date.UTC(2020, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10)
}

/** Gera partidas por competição e temporada, com datas crescentes. */
function dataset(spec: Array<{ competition: string; season: string; matches: number }>): EngineeredMatchRecord[] {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const lines: string[] = []
  let day = 0
  const teams = ['A', 'B', 'C', 'D']
  for (const group of spec) {
    for (let i = 0; i < group.matches; i += 1) {
      lines.push(`${group.competition},L,${group.season},${isoDay(day)},${teams[i % 4]},${teams[(i + 1) % 4]},${i % 4},${(i + 1) % 3},test`)
      day += 1
    }
  }
  return assessDataQuality(parseCsv([header, ...lines].join('\n'))).records
}

function indexSet(records: EngineeredMatchRecord[]) {
  return new Set(records.map((record) => record.index))
}

test('divide por temporada completa quando há temporadas suficientes', () => {
  const records = dataset([
    { competition: 'Liga', season: '2020', matches: 10 },
    { competition: 'Liga', season: '2021', matches: 10 },
    { competition: 'Liga', season: '2022', matches: 10 },
    { competition: 'Liga', season: '2023', matches: 10 },
  ])
  const split = temporalThreeWaySplit(records)
  const competition = split.report.competitions[0]
  assert.equal(competition.strategy, 'by_season')
  // teste = temporada mais recente; validação = anterior; treino = as demais.
  assert.equal(split.test.every((record) => record.season === '2023'), true)
  assert.equal(split.validation.every((record) => record.season === '2022'), true)
  assert.equal(split.train.every((record) => record.season === '2020' || record.season === '2021'), true)
})

test('sem sobreposição entre treino, validação e teste; test held-out do development', () => {
  const records = dataset([
    { competition: 'Liga', season: '2020', matches: 12 },
    { competition: 'Liga', season: '2021', matches: 12 },
    { competition: 'Liga', season: '2022', matches: 12 },
  ])
  const split = temporalThreeWaySplit(records)
  const train = indexSet(split.train)
  const validation = indexSet(split.validation)
  const testSet = indexSet(split.test)
  for (const index of validation) assert.ok(!train.has(index))
  for (const index of testSet) assert.ok(!train.has(index) && !validation.has(index))
  // development = treino + validação, sem nenhuma partida do teste.
  const development = indexSet(split.development)
  for (const index of testSet) assert.ok(!development.has(index))
  assert.equal(train.size + validation.size + testSet.size, records.length)
})

test('registra limites temporais e nenhuma competição some do relatório', () => {
  const records = dataset([
    { competition: 'Grande', season: '2020', matches: 10 },
    { competition: 'Grande', season: '2021', matches: 10 },
    { competition: 'Grande', season: '2022', matches: 10 },
    { competition: 'Pequena', season: '2022', matches: 3 },
  ])
  const split = temporalThreeWaySplit(records)
  const names = split.report.competitions.map((competition) => competition.competition)
  assert.deepEqual(names, ['Grande', 'Pequena'])
  const small = split.report.competitions.find((competition) => competition.competition === 'Pequena')!
  assert.equal(small.lowHistory, true)
  assert.equal(small.strategy, 'by_ratio')
  assert.ok(small.note && small.note.length > 0)
  assert.ok(split.report.train.from <= split.report.train.to)
})

test('resultado determinístico: mesma entrada produz o mesmo split', () => {
  const records = dataset([
    { competition: 'Liga', season: '2020', matches: 9 },
    { competition: 'Liga', season: '2021', matches: 9 },
    { competition: 'Liga', season: '2022', matches: 9 },
  ])
  assert.deepEqual(temporalThreeWaySplit(records).report, temporalThreeWaySplit(records).report)
})

test('walk-forward é expansível e nenhuma partida futura entra no treino', () => {
  const records = dataset([
    { competition: 'Liga', season: '2020', matches: 8 },
    { competition: 'Liga', season: '2021', matches: 8 },
    { competition: 'Liga', season: '2022', matches: 8 },
    { competition: 'Liga', season: '2023', matches: 8 },
  ])
  const development = temporalThreeWaySplit(records).development
  const plan = walkForwardFolds(development)

  assert.ok(plan.folds.length >= 1)
  let previousTrainSize = 0
  for (const fold of plan.folds) {
    // janela expansível: cada fold tem treino >= o anterior.
    assert.ok(fold.train.length >= previousTrainSize)
    previousTrainSize = fold.train.length
    // nenhuma data de treino é posterior ao início da validação.
    const trainMax = Math.max(...fold.train.map((record) => new Date(record.date!).getTime()))
    const validationMin = Math.min(...fold.validation.map((record) => new Date(record.date!).getTime()))
    assert.ok(trainMax < validationMin, `fold ${fold.fold} tem vazamento temporal`)
  }
})

test('competição com histórico insuficiente para walk-forward é sinalizada, não sumida', () => {
  const records = dataset([{ competition: 'Solo', season: '2020', matches: 1 }])
  const plan = walkForwardFolds(records)
  const solo = plan.competitions.find((competition) => competition.competition === 'Solo')!
  assert.equal(solo.folds, 0)
  assert.ok(solo.note && /insuficiente/i.test(solo.note))
})
