import crypto from 'crypto'
import { CorruptedDataError, DecryptionFailedError } from './errors'
import { E2EVersion, type IE2EPayload } from './types'

const PBKDF2_ITERATIONS = 600000
const PBKDF2_DIGEST = 'sha256'
const SALT_BYTES = 16
const KEK_BYTES = 32
const DEK_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

class E2ECryptoService {
  generateE2EPayload (config: string, pin: string): { payload: IE2EPayload, dek: Buffer } {
    const salt = crypto.randomBytes(SALT_BYTES)
    const dek = crypto.randomBytes(DEK_BYTES)
    const encryptedDEK = this.wrapDEK(dek, pin, salt)
    const encryptedConfig = this.encryptConfig(config, dek)

    return {
      payload: {
        e2eVersion: E2EVersion.V1,
        salt: salt.toString('base64'),
        encryptedDEK,
        config: encryptedConfig
      },
      dek
    }
  }

  encryptConfig (config: string, dek: Buffer): string {
    return this.encryptWithKey(Buffer.from(config, 'utf8'), dek)
  }

  decryptConfig (encryptedConfig: string, dek: Buffer): string {
    return this.decryptWithKey(encryptedConfig, dek).toString('utf8')
  }

  wrapDEK (dek: Buffer, pin: string, salt: Buffer): string {
    const kek = this.deriveKEK(pin, salt)
    return this.encryptWithKey(dek, kek)
  }

  unwrapDEK (encryptedDEK: string, pin: string, salt: Buffer): Buffer {
    const kek = this.deriveKEK(pin, salt)
    return this.decryptWithKey(encryptedDEK, kek)
  }

  decodeSalt (saltBase64: string): Buffer {
    const salt = Buffer.from(saltBase64, 'base64')
    if (salt.length !== SALT_BYTES) {
      throw new CorruptedDataError('Invalid salt length')
    }
    return salt
  }

  private deriveKEK (pin: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, KEK_BYTES, PBKDF2_DIGEST)
  }

  private encryptWithKey (data: Buffer, key: Buffer): string {
    const iv = crypto.randomBytes(IV_BYTES)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, ciphertext]).toString('base64')
  }

  private decryptWithKey (payloadBase64: string, key: Buffer): Buffer {
    const payload = Buffer.from(payloadBase64, 'base64')
    if (payload.length < IV_BYTES + TAG_BYTES) {
      throw new CorruptedDataError('Encrypted payload is too short')
    }
    const iv = payload.subarray(0, IV_BYTES)
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES)

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to decrypt payload'
      throw new DecryptionFailedError(message)
    }
  }
}

export { E2ECryptoService }

