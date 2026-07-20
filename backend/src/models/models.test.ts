import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from '../csv.js'
import { assessDataQuality } from '../dataQuality.js'
import { generateSequentialFeatures, type FeatureExample } from '../preMatchFeatures.js'
import { candidateModels } from './registry.js'
import { poissonModel } from './poisson.js'
import { COMPARISON_MARKETS, selectionKeys } from './types.js'

function examples(matches = 60): FeatureExample[] {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta']
  const base = Date.UTC(2024, 0, 1)
  const lines: string[] = []
  for (let i = 0; i < matches; i += 1) {
    const date = new Date(base + i * 86_400_000).toISOString().slice(0, 10)
    lines.push(`Liga,L,2024,${date},${teams[i % 6]},${teams[(i + 1) % 6]},${i % 4},${(i + 1) % 3},test`)
  }
  return generateSequentialFeatures(assessDataQuality(parseCsv([header, ...lines].join('\n'))).records)
}

test('todo modelo candidato produz probabilidades válidas e coerentes', () => {
  const data = examples()
  const train = data.slice(0, 45)
  const evaluation = data.slice(45)

  for (const model of candidateModels) {
    const trained = model.train(train)
    for (const example of evaluation) {
      const prediction = trained.predict(example)
      for (const market of COMPARISON_MARKETS) {
        const probabilities = prediction[market]
        if (!probabilities) continue
        for (const key of selectionKeys(market)) {
          const probability = probabilities[key]
          assert.ok(probability !== undefined, `${model.metadata().name}/${market}/${key} ausente`)
          assert.ok(probability > 0 && probability < 1, `${model.metadata().name}/${market}/${key}=${probability} fora de (0,1)`)
        }
      }
      // 1X2 soma ~1.
      const x2 = prediction['1X2']
      if (x2) {
        const total = x2.home_win + x2.draw + x2.away_win
        assert.ok(Math.abs(total - 1) < 0.05, `1X2 de ${model.metadata().name} soma ${total}`)
      }
    }
  }
})

test('Poisson mantém monotonicidade Over1.5 >= Over2.5 >= Over3.5', () => {
  const data = examples()
  const trained = poissonModel.train(data.slice(0, 45))
  for (const example of data.slice(45)) {
    const prediction = trained.predict(example)
    const over15 = prediction.OVER_1_5_GOALS!.over_1_5
    const over25 = prediction.OVER_2_5_GOALS!.over_2_5
    const over35 = prediction.OVER_3_5_GOALS!.over_3_5
    assert.ok(over15 >= over25 - 1e-9 && over25 >= over35 - 1e-9, `monotonicidade violada: ${over15} ${over25} ${over35}`)
  }
})

test('cada modelo é determinístico: mesmo treino e exemplo geram a mesma predição', () => {
  const data = examples()
  const train = data.slice(0, 45)
  const target = data[50]
  for (const model of candidateModels) {
    const first = model.train(train).predict(target)
    const second = model.train(train).predict(target)
    assert.deepEqual(second, first, `modelo ${model.metadata().name} não é determinístico`)
  }
})
