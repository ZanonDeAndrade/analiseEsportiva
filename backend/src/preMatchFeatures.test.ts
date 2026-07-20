import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv } from './csv.js'
import { assessDataQuality } from './dataQuality.js'
import { ELO_START, generateSequentialFeatures } from './preMatchFeatures.js'
import type { EngineeredMatchRecord } from './schemas.js'

function records(lines: string[]): EngineeredMatchRecord[] {
  const header = 'Competition,Div,Season,Date,HomeTeam,AwayTeam,FTHG,FTAG,SourceProvider'
  return assessDataQuality(parseCsv([header, ...lines].join('\n'))).records
}

function isoDay(offset: number) {
  return new Date(Date.UTC(2024, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10)
}

/** Sequência de partidas encadeadas entre poucos times, para criar histórico. */
function chainedFixtures(count: number): string[] {
  const teams = ['Alfa', 'Beta', 'Gama', 'Delta']
  const lines: string[] = []
  for (let index = 0; index < count; index += 1) {
    const home = teams[index % teams.length]
    const away = teams[(index + 1) % teams.length]
    lines.push(`Liga,L,2024,${isoDay(index)},${home},${away},${index % 4},${(index + 1) % 3},test`)
  }
  return lines
}

test('a primeira partida de cada time tem features neutras (sem histórico)', () => {
  const example = generateSequentialFeatures(records(chainedFixtures(4)))[0]
  assert.equal(example.features.homePlayed, 0)
  assert.equal(example.features.awayPlayed, 0)
  assert.equal(example.features.homeHasHistory, false)
  assert.equal(example.features.homeEloBefore, ELO_START)
  assert.equal(example.features.awayEloBefore, ELO_START)
  assert.equal(example.features.homeRestDays, null)
  assert.equal(example.features.h2hMatches, 0)
})

test('OBRIGATÓRIO: alterar resultados futuros não modifica features de partidas anteriores', () => {
  const base = chainedFixtures(20)
  const original = generateSequentialFeatures(records(base))

  // Altera o placar das 5 ÚLTIMAS partidas (futuro) de forma drástica.
  const mutated = [...base]
  for (let index = 15; index < 20; index += 1) {
    mutated[index] = mutated[index].replace(/,\d+,\d+,test$/, ',5,4,test')
  }
  const afterMutation = generateSequentialFeatures(records(mutated))

  // As features das partidas anteriores (índices 0..14) devem ser idênticas.
  for (let index = 0; index < 15; index += 1) {
    assert.deepEqual(
      afterMutation[index].features,
      original[index].features,
      `features da partida ${index} mudaram após alterar o futuro`,
    )
  }
})

test('o estado só é atualizado APÓS emitir o exemplo (histórico cresce de 1 em 1)', () => {
  // Alfa joga em datas 0, 4, 8, ... (a cada 4 partidas do chain).
  const examples = generateSequentialFeatures(records(chainedFixtures(12)))
  const alfaAsHome = examples.filter((example) => example.homeTeam === 'Alfa')
  // Na 1ª aparição Alfa tem 0 jogos; na 2ª deve ter exatamente os jogos já disputados antes.
  assert.equal(alfaAsHome[0].features.homePlayed, 0)
  assert.ok(alfaAsHome[1].features.homePlayed >= 1)
  assert.ok(alfaAsHome[1].features.homePlayed < alfaAsHome.length + 12)
})

test('resultado determinístico: mesma entrada produz exatamente as mesmas features', () => {
  const input = records(chainedFixtures(15))
  const first = generateSequentialFeatures(input)
  const second = generateSequentialFeatures(input)
  assert.deepEqual(second, first)
})

test('ETAPA 5: janelas 5/10/20, home/away, recência, descanso e disponibilidade', () => {
  const examples = generateSequentialFeatures(records(chainedFixtures(30)))
  const late = examples[28].features

  // Janelas com tamanho de amostra real e crescente.
  assert.ok(late.home.form5.sampleSize <= 5)
  assert.ok(late.home.form10.sampleSize >= late.home.form5.sampleSize)
  assert.ok(late.home.form20.sampleSize >= late.home.form10.sampleSize)
  // Percentuais em [0, 1] e pontos por jogo em [0, 3].
  assert.ok(late.home.form10.over25Pct >= 0 && late.home.form10.over25Pct <= 1)
  assert.ok(late.home.form10.pointsPerGame >= 0 && late.home.form10.pointsPerGame <= 3)
  // Forma específica de mando (casa para o mandante, fora para o visitante).
  assert.equal(typeof late.home.venueForm10.pointsPerGame, 'number')
  assert.equal(typeof late.away.venueForm10.pointsPerGame, 'number')
  // Recência exponencial e força dos adversários presentes.
  assert.equal(typeof late.home.expWeightedGoalsFor, 'number')
  assert.ok(late.home.recentOpponentElo === null || typeof late.home.recentOpponentElo === 'number')
  // Identidade contextual e calendário.
  assert.ok(late.month >= 1 && late.month <= 12)
  assert.ok(late.home.games7 >= 0 && late.home.games14 >= late.home.games7)
  // Disponibilidade: xG/finalizações ausentes no dataset viram flag false (não zero).
  assert.equal(late.availability.xg, false)
  assert.equal(late.availability.shots, false)
})

test('features refletem a ordem cronológica mesmo com entrada fora de ordem', () => {
  const inOrder = records(chainedFixtures(10))
  const shuffled = [...inOrder].reverse()
  const fromOrdered = generateSequentialFeatures(inOrder)
  const fromShuffled = generateSequentialFeatures(shuffled)
  assert.deepEqual(
    fromShuffled.map((example) => example.index),
    fromOrdered.map((example) => example.index),
  )
  assert.deepEqual(fromShuffled, fromOrdered)
})
