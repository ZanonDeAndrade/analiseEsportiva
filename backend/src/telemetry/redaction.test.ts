import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeTelemetryFields, sanitizeTelemetryString } from './redaction.js'

test('telemetria remove segredos, PII, payloads e query strings', () => {
  const sanitized = sanitizeTelemetryFields({
    requestId: '11111111-1111-4111-8111-111111111111',
    userId: 'user-safe-id',
    authorization: 'Bearer secret-token',
    nested: {
      password: 'secret-password',
      email: 'person@example.test',
      url: 'https://provider.test/path?access_token=secret',
      payload: { card: '4111111111111111' },
    },
  }) as Record<string, unknown>

  const serialized = JSON.stringify(sanitized)
  assert.match(serialized, /user-safe-id/)
  for (const secret of ['secret-token', 'secret-password', 'person@example.test', '4111111111111111', 'access_token=secret']) {
    assert.equal(serialized.includes(secret), false, `vazamento detectado: ${secret}`)
  }
})

test('telemetria remove JWT e bearer mesmo em campo permitido', () => {
  const value = sanitizeTelemetryString(
    'falha Bearer abc.def.ghi token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
  )
  assert.equal(value.includes('abc.def.ghi'), false)
  assert.equal(value.includes('eyJhbGci'), false)
})

