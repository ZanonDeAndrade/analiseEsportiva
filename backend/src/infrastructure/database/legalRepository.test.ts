import assert from 'node:assert/strict'
import test from 'node:test'
import { findMissingDocumentTypes } from './legalRepository.js'

test('correção não material preserva o grupo de aceite e não exige novo clickwrap', () => {
  const missing = findMissingDocumentTypes(
    [{ type: 'terms', acceptanceGroup: 'terms-material-1' }],
    [{ type: 'terms', acceptanceGroup: 'terms-material-1' }],
  )
  assert.deepEqual(missing, [])
})

test('alteração material usa novo grupo e exige novo aceite sem apagar o anterior', () => {
  const missing = findMissingDocumentTypes(
    [{ type: 'terms', acceptanceGroup: 'terms-material-2' }],
    [{ type: 'terms', acceptanceGroup: 'terms-material-1' }],
  )
  assert.deepEqual(missing, ['terms'])
})
