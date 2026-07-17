import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface EncryptedField {
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: string
}

/** AES-256-GCM envelope for PII that must remain readable by restricted workflows. */
export class AesGcmFieldCipher {
  private readonly key: Buffer

  constructor(keyBase64: string, private readonly keyVersion: string) {
    this.key = Buffer.from(keyBase64, 'base64')
    if (this.key.length !== 32) throw new Error('PII_FIELD_ENCRYPTION_KEY deve conter exatamente 32 bytes em base64.')
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(keyVersion)) throw new Error('PII_FIELD_ENCRYPTION_KEY_VERSION invalida.')
  }

  encrypt(value: string, context: string): EncryptedField {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(context, 'utf8'))
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.keyVersion,
    }
  }

  decrypt(value: EncryptedField, context: string): string {
    if (value.keyVersion !== this.keyVersion) throw new Error('Versao de chave de criptografia indisponivel.')
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv, 'base64'))
    decipher.setAAD(Buffer.from(context, 'utf8'))
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }
}
