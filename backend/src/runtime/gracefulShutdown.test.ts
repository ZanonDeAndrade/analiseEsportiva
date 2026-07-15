import assert from 'node:assert/strict'
import test from 'node:test'
import { createGracefulShutdownController } from './gracefulShutdown.js'

test('shutdown gracioso e idempotente e fecha recursos uma unica vez', async () => {
  let closes = 0
  const events: string[] = []
  const controller = createGracefulShutdownController({
    processName: 'test',
    timeoutMs: 1_000,
    close: async () => { closes += 1 },
    logger: {
      info: (value) => events.push(String(value)),
      error: (value) => events.push(String(value)),
    },
    forceExit: () => assert.fail('nao deveria forcar encerramento'),
  })

  const first = controller.shutdown('manual')
  const second = controller.shutdown('SIGTERM')
  assert.equal(first, second)
  await first
  assert.equal(closes, 1)
  assert.match(events.join('\n'), /shutdown_started/)
  assert.match(events.join('\n'), /shutdown_completed/)
})
