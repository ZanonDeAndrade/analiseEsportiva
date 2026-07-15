import assert from 'node:assert/strict'
import test from 'node:test'
import { consoleJobLogger } from './logging.js'

test('logger de job preserva correlação e não serializa segredos', () => {
  const previous = console.log
  let output = ''
  console.log = (value?: unknown) => { output += String(value) }
  try {
    consoleJobLogger.info('job_test', {
      jobId: 'job-safe-id',
      requestId: 'request-safe-id',
      datasetVersion: 'dataset-safe-id',
      modelVersion: 'model-safe-id',
      authorization: 'Bearer top-secret',
      payload: { password: 'another-secret' },
    })
  } finally {
    console.log = previous
  }
  for (const expected of ['job-safe-id', 'request-safe-id', 'dataset-safe-id', 'model-safe-id']) {
    assert.match(output, new RegExp(expected))
  }
  assert.equal(output.includes('top-secret'), false)
  assert.equal(output.includes('another-secret'), false)
})

