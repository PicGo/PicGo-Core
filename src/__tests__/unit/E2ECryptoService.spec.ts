import { describe, expect, it } from 'vitest'
import { E2ECryptoService } from '../../lib/ConfigSyncManager/E2ECryptoService'
import { CorruptedDataError, DecryptionFailedError } from '../../lib/ConfigSyncManager/errors'
import { E2EVersion } from '../../lib/ConfigSyncManager/types'

describe('E2ECryptoService', () => {
  it('should generate payload and decrypt config with correct PIN', () => {
    const service = new E2ECryptoService()
    const config = '{ "a": 1 }'
    const pin = '1234'

    const { payload, dek } = service.generateE2EPayload(config, pin)

    expect(payload.e2eVersion).toBe(E2EVersion.V1)
    expect(payload.salt).toBeTypeOf('string')
    expect(payload.encryptedDEK).toBeTypeOf('string')

    const salt = service.decodeSalt(payload.salt)
    const derivedDek = service.unwrapDEK(payload.encryptedDEK, pin, salt)
    expect(derivedDek.equals(dek)).toBe(true)

    const decryptedConfig = service.decryptConfig(payload.config, derivedDek)
    expect(decryptedConfig).toBe(config)
  })

  it('should fail decrypting with a wrong DEK', () => {
    const service = new E2ECryptoService()
    const config = '{ "a": 1 }'
    const pin = '1234'

    const { payload } = service.generateE2EPayload(config, pin)
    const wrongDek = Buffer.alloc(32, 1)

    expect(() => service.decryptConfig(payload.config, wrongDek)).toThrow(DecryptionFailedError)
  })

  it('should reject invalid salt length', () => {
    const service = new E2ECryptoService()
    const invalidSalt = Buffer.alloc(8).toString('base64')

    expect(() => service.decodeSalt(invalidSalt)).toThrow(CorruptedDataError)
  })

  it('should reject payloads that are too short', () => {
    const service = new E2ECryptoService()
    const shortPayload = Buffer.alloc(10).toString('base64')
    const dek = Buffer.alloc(32, 1)

    expect(() => service.decryptConfig(shortPayload, dek)).toThrow(CorruptedDataError)
  })
})
