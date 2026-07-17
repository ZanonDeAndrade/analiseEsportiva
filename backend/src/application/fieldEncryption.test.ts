import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { AesGcmFieldCipher } from './fieldEncryption.js'

test('PII criptografada usa nonce aleatorio, AAD e nao persiste texto puro', () => {
  const cipher = new AesGcmFieldCipher(randomBytes(32).toString('base64'), 'test-v1')
  const first = cipher.encrypt('{"email":"titular@example.test"}', 'support:ticket-1')
  const second = cipher.encrypt('{"email":"titular@example.test"}', 'support:ticket-1')
  assert.notEqual(first.ciphertext, second.ciphertext)
  assert.doesNotMatch(first.ciphertext, /titular/)
  assert.equal(cipher.decrypt(first, 'support:ticket-1'), '{"email":"titular@example.test"}')
  assert.throws(() => cipher.decrypt(first, 'support:outro-ticket'))
})

test('chave de campo precisa ter 256 bits', () => {
  assert.throws(() => new AesGcmFieldCipher(Buffer.from('curta').toString('base64'), 'v1'))
})
