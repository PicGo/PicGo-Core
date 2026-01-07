import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { parse, stringify } from 'comment-json'
import { get, isPlainObject, set, unset } from 'lodash'
import type { IPicGo } from '../../types'

const { mockFetchConfig, mockUpdateConfig } = vi.hoisted(() => {
  return {
    mockFetchConfig: vi.fn(),
    mockUpdateConfig: vi.fn()
  }
})

vi.mock('../../lib/Cloud/services/ConfigService', () => {
  class ConfigService {
    fetchConfig = mockFetchConfig
    updateConfig = mockUpdateConfig
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor (_ctx: any) {}
  }
  return { ConfigService }
})

import { ConfigSyncManager, SyncStatus, EncryptionIntent, E2EAskPinReason } from '../../lib/ConfigSyncManager'
import { E2ECryptoService } from '../../lib/ConfigSyncManager/E2ECryptoService'

const createCtx = (configPath: string): IPicGo => {
  let configState: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8')
    const parsed = parse(content)
    if (isPlainObject(parsed)) {
      configState = parsed as Record<string, unknown>
    }
  }

  const saveConfig = (config: Record<string, unknown>): void => {
    Object.keys(config).forEach((name: string) => {
      set(configState, name, config[name])
    })
    const content = stringify(configState, null, 2)
    fs.writeFileSync(configPath, content, 'utf8')
  }

  const getConfig = <T = unknown>(name?: string): T => {
    if (!name) return configState as T
    return get(configState, name) as T
  }

  const setConfig = (config: Record<string, unknown>): void => {
    Object.keys(config).forEach((name: string) => {
      set(configState, name, config[name])
    })
  }

  const removeConfig = (key: string, propName: string): void => {
    const target = get(configState, key)
    if (isPlainObject(target)) {
      unset(target as Record<string, unknown>, propName)
    }
    const content = stringify(configState, null, 2)
    fs.writeFileSync(configPath, content, 'utf8')
  }

  return {
    configPath,
    baseDir: path.dirname(configPath),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    },
    saveConfig,
    getConfig,
    setConfig,
    removeConfig
  } as unknown as IPicGo
}

const createTmpDir = async (): Promise<string> => {
  return fs.mkdtemp(path.join(os.tmpdir(), 'picgo-core-config-sync-'))
}

describe('ConfigSyncManager Versioned Sync Flow', () => {
  let tmpDir: string
  let configPath: string
  let snapshotPath: string

  beforeEach(async () => {
    mockFetchConfig.mockReset()
    mockUpdateConfig.mockReset()

    tmpDir = await createTmpDir()
    configPath = path.join(tmpDir, 'config.json')
    snapshotPath = path.join(tmpDir, 'config.snapshot.json')
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('Normal sync should update snapshot with new remote version', async () => {
    await fs.writeFile(configPath, '{ "a": 2 }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({ version: 5, updatedAt: '2020-01-01T00:00:00.000Z', data: { a: 1 } }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({ version: 5, config: '{ "a": 1 }' })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 6 })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<number>('a')).toBe(2)
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.stringContaining('"a": 2'), 5, { e2eVersion: 0 })

    const snapshot = parse(await fs.readFile(snapshotPath, 'utf8')) as any
    expect(snapshot.version).toBe(6)
    expect(snapshot.data.a).toBe(2)
  })

  it('Conflict should fail sync when remote version mismatched', async () => {
    await fs.writeFile(configPath, '{ "a": 2 }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({ version: 5, updatedAt: '2020-01-01T00:00:00.000Z', data: { a: 1 } }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({ version: 5, config: '{ "a": 1 }' })
    mockUpdateConfig.mockResolvedValue({ success: false, conflict: true, version: 6 })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.FAILED)
    expect(res.message).toBe('Sync failed: Remote config is changing too frequently. Please try again later.')
    expect(mockUpdateConfig).toHaveBeenCalledTimes(2)
  })

  it('Restore from Local should push and update snapshot when remote is missing', async () => {
    await fs.writeFile(configPath, '{ "a": 1 }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({ version: 5, updatedAt: '2020-01-01T00:00:00.000Z', data: { a: 0 } }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue(null)
    mockUpdateConfig.mockResolvedValue({ success: true, version: 1 })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(res.message).toBe('Remote config restored from local')
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.stringContaining('"a": 1'), 0, { e2eVersion: 0 })

    const snapshot = parse(await fs.readFile(snapshotPath, 'utf8')) as any
    expect(snapshot.version).toBe(1)
    expect(snapshot.data.a).toBe(1)
  })

  it('should ignore conflicts on ignored fields and avoid pushing them', async () => {
    await fs.writeFile(configPath, '{ "a": 1, "settings": { "picgoCloud": { "token": "local-token", "enableE2E": false }, "server": { "port": 36677 } } }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 5,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1, settings: { picgoCloud: { token: 'snapshot-token', enableE2E: true }, server: { port: 36677 } } }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 5,
      config: '{ "a": 2, "settings": { "picgoCloud": { "token": "remote-token", "enableE2E": true }, "server": { "port": 36677 } } }'
    })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<string>('settings.picgoCloud.token')).toBe('local-token')
    expect(ctx.getConfig<boolean>('settings.picgoCloud.enableE2E')).toBe(false)
    expect(mockUpdateConfig).not.toHaveBeenCalled()

    const writtenLocal = parse(await fs.readFile(configPath, 'utf8')) as any
    expect(writtenLocal.settings.picgoCloud.token).toBe('local-token')
    expect(writtenLocal.settings.picgoCloud.enableE2E).toBe(false)
    expect(writtenLocal.a).toBe(2)
  })

  it('should not push local secret values in ignored fields', async () => {
    await fs.writeFile(configPath, '{ "a": 3, "settings": { "picgoCloud": { "token": "local-token" } } }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 5,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1, settings: { picgoCloud: { token: 'snapshot-token' } } }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 5,
      config: '{ "a": 1, "settings": { "picgoCloud": { "token": "remote-token" } } }'
    })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 6 })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<string>('settings.picgoCloud.token')).toBe('local-token')
    expect(ctx.getConfig<number>('a')).toBe(3)
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1)

    const [configStr, baseVersion] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(5)
    expect(configStr).toContain('"a": 3')
    expect(configStr).toContain('remote-token')
    expect(configStr).not.toContain('local-token')

    const snapshot = parse(await fs.readFile(snapshotPath, 'utf8')) as any
    expect(snapshot.version).toBe(6)
    expect(snapshot.data.settings.picgoCloud.token).toBe('local-token')
  })

  it('Logout deletion should not conflict and should retain remote secret token when pushing', async () => {
    await fs.writeFile(configPath, '{ "a": 2, "settings": { "picgoCloud": {} } }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 5,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1, settings: { picgoCloud: { token: 'snapshot-token' } } }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 5,
      config: '{ "a": 1, "settings": { "picgoCloud": { "token": "remote-token" } } }'
    })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 6 })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<string | undefined>('settings.picgoCloud.token')).toBeUndefined()
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1)

    const [configStr, baseVersion] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(5)
    expect(configStr).toContain('"a": 2')
    expect(configStr).toContain('remote-token')

    const writtenLocal = parse(await fs.readFile(configPath, 'utf8')) as any
    expect(writtenLocal.settings.picgoCloud.token).toBeUndefined()

    const snapshot = parse(await fs.readFile(snapshotPath, 'utf8')) as any
    expect(snapshot.version).toBe(6)
    expect(snapshot.data.settings.picgoCloud.token).toBeUndefined()
  })

  it('applyResolvedConfig should keep local ignored fields on disk and keep remote ignored fields on push', async () => {
    await fs.writeFile(configPath, '{ "settings": { "picgoCloud": { "token": "LOCAL_TOKEN" } }, "theme": "dark" }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 5,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { settings: { picgoCloud: { token: 'snapshot-token' } }, theme: 'system' }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 5,
      config: '{ "settings": { "picgoCloud": { "token": "REMOTE_TOKEN" } }, "theme": "light" }'
    })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 6 })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)

    const syncRes = await manager.sync()
    expect(syncRes.status).toBe(SyncStatus.CONFLICT)
    expect(mockUpdateConfig).not.toHaveBeenCalled()

    const applyRes = await manager.applyResolvedConfig({
      picBed: { uploader: 'smms' },
      picgoPlugins: {},
      settings: { picgoCloud: { token: 'REMOTE_TOKEN' } },
      theme: 'light'
    })

    expect(applyRes.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<string>('theme')).toBe('light')
    expect(ctx.getConfig<string>('settings.picgoCloud.token')).toBe('LOCAL_TOKEN')
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1)

    const [configStr, baseVersion] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(5)
    expect(configStr).toContain('"theme": "light"')
    expect(configStr).toContain('REMOTE_TOKEN')
    expect(configStr).not.toContain('LOCAL_TOKEN')

    const writtenLocal = parse(await fs.readFile(configPath, 'utf8')) as any
    expect(writtenLocal.theme).toBe('light')
    expect(writtenLocal.settings.picgoCloud.token).toBe('LOCAL_TOKEN')

    const snapshot = parse(await fs.readFile(snapshotPath, 'utf8')) as any
    expect(snapshot.version).toBe(6)
    expect(snapshot.data.theme).toBe('light')
    expect(snapshot.data.settings.picgoCloud.token).toBe('LOCAL_TOKEN')
  })

  it('force encrypt should upload encrypted payload for plain remote', async () => {
    await fs.writeFile(configPath, '{ "a": 1 }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1 }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({ version: 1, config: '{ "a": 1 }' })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 2 })

    const onAskPin = vi.fn().mockResolvedValue('1234')
    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync({ encryptionIntent: EncryptionIntent.FORCE_ENCRYPT })

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<boolean>('settings.picgoCloud.enableE2E')).toBe(true)
    expect(onAskPin).toHaveBeenCalledWith(E2EAskPinReason.SETUP, 0)

    const [configStr, baseVersion, e2eFields] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(1)
    expect(e2eFields.e2eVersion).toBe(1)
    expect(typeof e2eFields.salt).toBe('string')
    expect(typeof e2eFields.encryptedDEK).toBe('string')

    const cryptoService = new E2ECryptoService()
    const salt = cryptoService.decodeSalt(e2eFields.salt)
    const dek = cryptoService.unwrapDEK(e2eFields.encryptedDEK, '1234', salt)
    const decryptedConfig = cryptoService.decryptConfig(configStr, dek)
    expect(decryptedConfig).toContain('"a": 1')
  })

  it('should default to force encrypt when local enableE2E is true', async () => {
    await fs.writeFile(configPath, '{ "a": 1, "settings": { "picgoCloud": { "enableE2E": true } } }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1, settings: { picgoCloud: { enableE2E: true } } }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({ version: 1, config: '{ "a": 1 }' })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 2 })

    const onAskPin = vi.fn().mockResolvedValue('1234')
    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(onAskPin).toHaveBeenCalledWith(E2EAskPinReason.SETUP, 0)

    const [configStr, baseVersion, e2eFields] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(1)
    expect(e2eFields.e2eVersion).toBe(1)
    expect(typeof e2eFields.salt).toBe('string')
    expect(typeof e2eFields.encryptedDEK).toBe('string')

    const cryptoService = new E2ECryptoService()
    const salt = cryptoService.decodeSalt(e2eFields.salt)
    const dek = cryptoService.unwrapDEK(e2eFields.encryptedDEK, '1234', salt)
    const decryptedConfig = cryptoService.decryptConfig(configStr, dek)
    expect(decryptedConfig).toContain('"a": 1')
  })

  it('force plain should downgrade encrypted remote config', async () => {
    const configStr = stringify({ a: 1 }, null, 2)
    const cryptoService = new E2ECryptoService()
    const { payload } = cryptoService.generateE2EPayload(configStr, '1234')

    await fs.writeFile(configPath, configStr, 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1 }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 1,
      config: payload.config,
      e2eVersion: payload.e2eVersion,
      salt: payload.salt,
      encryptedDEK: payload.encryptedDEK
    })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 2 })

    const onAskPin = vi.fn().mockResolvedValue('1234')
    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync({ encryptionIntent: EncryptionIntent.FORCE_PLAIN })

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<boolean>('settings.picgoCloud.enableE2E')).toBe(false)
    expect(onAskPin).toHaveBeenCalledWith(E2EAskPinReason.DECRYPT, 0)

    const [pushedConfig, baseVersion, e2eFields] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(1)
    expect(pushedConfig).toContain('"a": 1')
    expect(e2eFields).toEqual({ e2eVersion: 0 })
  })

  it('should default to force plain when local enableE2E is false', async () => {
    const configStr = stringify({ a: 1, settings: { picgoCloud: { enableE2E: false } } }, null, 2)
    const cryptoService = new E2ECryptoService()
    const { payload } = cryptoService.generateE2EPayload(stringify({ a: 1 }, null, 2), '1234')

    await fs.writeFile(configPath, configStr, 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1, settings: { picgoCloud: { enableE2E: false } } }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 1,
      config: payload.config,
      e2eVersion: payload.e2eVersion,
      salt: payload.salt,
      encryptedDEK: payload.encryptedDEK
    })
    mockUpdateConfig.mockResolvedValue({ success: true, version: 2 })

    const onAskPin = vi.fn().mockResolvedValue('1234')
    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(onAskPin).toHaveBeenCalledWith(E2EAskPinReason.DECRYPT, 0)

    const [pushedConfig, baseVersion, e2eFields] = mockUpdateConfig.mock.calls[0]
    expect(baseVersion).toBe(1)
    expect(pushedConfig).toContain('"a": 1')
    expect(e2eFields).toEqual({ e2eVersion: 0 })
  })

  it('should retry decryption and succeed with correct PIN', async () => {
    const configStr = stringify({ a: 1 }, null, 2)
    const cryptoService = new E2ECryptoService()
    const { payload } = cryptoService.generateE2EPayload(configStr, '1234')

    await fs.writeFile(configPath, configStr, 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1 }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 1,
      config: payload.config,
      e2eVersion: payload.e2eVersion,
      salt: payload.salt,
      encryptedDEK: payload.encryptedDEK
    })

    const onAskPin = vi.fn()
      .mockResolvedValueOnce('0000')
      .mockResolvedValueOnce('1234')

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(onAskPin).toHaveBeenCalledTimes(2)
    expect(onAskPin.mock.calls[0]).toEqual([E2EAskPinReason.DECRYPT, 0])
    expect(onAskPin.mock.calls[1]).toEqual([E2EAskPinReason.RETRY, 1])
    expect(mockUpdateConfig).not.toHaveBeenCalled()
  })

  it('should fail after max PIN retry attempts', async () => {
    const configStr = stringify({ a: 1 }, null, 2)
    const cryptoService = new E2ECryptoService()
    const { payload } = cryptoService.generateE2EPayload(configStr, '1234')

    await fs.writeFile(configPath, configStr, 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1 }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 1,
      config: payload.config,
      e2eVersion: payload.e2eVersion,
      salt: payload.salt,
      encryptedDEK: payload.encryptedDEK
    })

    const onAskPin = vi.fn().mockResolvedValue('0000')

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.FAILED)
    expect(res.message).toContain('Maximum retry attempts exceeded')
    expect(onAskPin).toHaveBeenCalledTimes(4)
    expect(onAskPin.mock.calls[0]).toEqual([E2EAskPinReason.DECRYPT, 0])
    expect(onAskPin.mock.calls[1]).toEqual([E2EAskPinReason.RETRY, 1])
    expect(onAskPin.mock.calls[2]).toEqual([E2EAskPinReason.RETRY, 2])
    expect(onAskPin.mock.calls[3]).toEqual([E2EAskPinReason.RETRY, 3])
    expect(mockUpdateConfig).not.toHaveBeenCalled()
  })

  it('should auto-enable local preference when remote is encrypted and preference is missing', async () => {
    const plainConfig = stringify({ a: 1 }, null, 2)
    const cryptoService = new E2ECryptoService()
    const { payload } = cryptoService.generateE2EPayload(plainConfig, '1234')

    await fs.writeFile(configPath, plainConfig, 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 1,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1 }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 1,
      config: payload.config,
      e2eVersion: payload.e2eVersion,
      salt: payload.salt,
      encryptedDEK: payload.encryptedDEK
    })

    const onAskPin = vi.fn().mockResolvedValue('1234')
    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx, { onAskPin })
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(ctx.getConfig<boolean>('settings.picgoCloud.enableE2E')).toBe(true)
    expect(onAskPin).toHaveBeenCalledWith(E2EAskPinReason.DECRYPT, 0)
    expect(mockUpdateConfig).not.toHaveBeenCalled()

    const writtenLocal = parse(await fs.readFile(configPath, 'utf8')) as any
    expect(writtenLocal.settings.picgoCloud.enableE2E).toBe(true)
  })
})
