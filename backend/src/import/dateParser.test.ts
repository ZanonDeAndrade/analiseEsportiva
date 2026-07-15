import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSourceDate } from './dateParser.js'

test('normaliza data ISO sem hora em UTC', () => {
  assert.equal(parseSourceDate('2026-07-15'), '2026-07-15T00:00:00.000Z')
})

test('normaliza DD/MM/AAAA explicitamente em UTC', () => {
  assert.equal(parseSourceDate('15/07/2026'), '2026-07-15T00:00:00.000Z')
})

test('preserva o instante de ISO 8601 com offset', () => {
  assert.equal(parseSourceDate('2026-07-15T12:30:00-03:00'), '2026-07-15T15:30:00.000Z')
})

test('rejeita datas ambiguas ou impossiveis', () => {
  assert.throws(() => parseSourceDate('07/15/2026'), /Data invalida/)
  assert.throws(() => parseSourceDate('31/02/2026'), /Data invalida/)
  assert.throws(() => parseSourceDate('15/07/26'), /Formatos aceitos/)
})
