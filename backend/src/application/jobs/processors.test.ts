import assert from 'node:assert/strict'
import test from 'node:test'
import type { InternalJobStore } from '../ports/jobs.js'
import { enqueueNormalizationAfterIngestion } from './processors.js'

test('resultado corrigido enfileira reprocessamento deterministico sem tenant global', async () => {
  let captured: Parameters<InternalJobStore['enqueueRelatedJob']>[0] | undefined
  const jobs = {
    enqueueRelatedJob: async (input: Parameters<InternalJobStore['enqueueRelatedJob']>[0]) => {
      captured = input
      return {
        id: '11111111-1111-4111-8111-111111111111',
        type: input.type,
        status: 'queued' as const,
        createdAt: '2026-07-15T00:00:00.000Z',
      }
    },
  } as unknown as InternalJobStore

  await enqueueNormalizationAfterIngestion(jobs, {
    jobId: '22222222-2222-4222-8222-222222222222',
    requestId: '33333333-3333-4333-8333-333333333333',
  }, {
    datasetVersionId: '44444444-4444-4444-8444-444444444444',
    correctedResults: 1,
  })

  assert.equal(captured?.idempotencyKey, 'dataset:44444444-4444-4444-8444-444444444444')
  assert.equal(captured?.organizationId, undefined)
  assert.deepEqual(captured?.payload, {
    correctionCount: 1,
    reason: 'corrected-results',
  })
})
