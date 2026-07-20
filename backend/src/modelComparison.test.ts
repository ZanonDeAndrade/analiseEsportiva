import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from './csv.js'
import { assessDataQuality } from './dataQuality.js'
import { compareModels } from './modelComparison.js'
import { candidateModels } from './models/registry.js'
import { generateSequentialFeatures } from './preMatchFeatures.js'
import { temporalThreeWaySplit, walkForwardFolds } from './temporalValidation.js'

function scenario() {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta']
  const lines: string[] = []
  let day = 0
  for (const season of ['2021', '2022', '2023']) {
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(Date.UTC(2021, 0, 1) + day * 86_400_000).toISOString().slice(0, 10)
      lines.push(`Liga,L,${season},${date},${teams[i % 4]},${teams[(i + 1) % 4]},${(i + season.length) % 4},${i % 3},test`)
      day += 1
    }
  }
  const records = assessDataQuality(parseCsv([header, ...lines].join('\n'))).records
  const examples = generateSequentialFeatures(records)
  const exampleByIndex = new Map(examples.map((example) => [example.index, example]))
  const plan = walkForwardFolds(temporalThreeWaySplit(records).development)
  return { plan, exampleByIndex }
}

test('a comparação pontua todos os modelos e produz um ranking', () => {
  const { plan, exampleByIndex } = scenario()
  const report = compareModels(plan, exampleByIndex, candidateModels)

  assert.equal(report.models.length, candidateModels.length)
  assert.ok(report.folds >= 1)
  for (const model of report.models) {
    assert.ok(model.meanBrierScore !== null, `${model.name} sem Brier`)
    assert.ok(model.meanBrierScore! > 0 && model.meanBrierScore! < 1)
  }
  assert.equal(report.ranking.length, candidateModels.length)
  // ranking ordenado por Brier crescente.
  for (let i = 1; i < report.ranking.length; i += 1) {
    assert.ok(report.ranking[i - 1].meanBrierScore! <= report.ranking[i].meanBrierScore!)
  }
})

test('a comparação é determinística', () => {
  const first = scenario()
  const second = scenario()
  const reportA = compareModels(first.plan, first.exampleByIndex, candidateModels)
  const reportB = compareModels(second.plan, second.exampleByIndex, candidateModels)
  assert.deepEqual(reportB.ranking, reportA.ranking)
})
