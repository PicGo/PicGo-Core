import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { parse } from 'comment-json'
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

import { ConfigSyncManager, SyncStatus } from '../../lib/ConfigSyncManager'

const createCtx = (configPath: string): IPicGo => {
  return {
    configPath,
    baseDir: path.dirname(configPath),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
  } as any
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
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.stringContaining('"a": 2'), 5)

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
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.stringContaining('"a": 1'), 0)

    const snapshot = parse(await fs.readFile(snapshotPath, 'utf8')) as any
    expect(snapshot.version).toBe(1)
    expect(snapshot.data.a).toBe(1)
  })

  it('should ignore conflicts on ignored fields and avoid pushing them', async () => {
    await fs.writeFile(configPath, '{ "a": 1, "settings": { "picgoCloud": { "token": "local-token" }, "server": { "port": 36677 } } }', 'utf8')
    await fs.writeFile(snapshotPath, JSON.stringify({
      version: 5,
      updatedAt: '2020-01-01T00:00:00.000Z',
      data: { a: 1, settings: { picgoCloud: { token: 'snapshot-token' }, server: { port: 36677 } } }
    }, null, 2), 'utf8')

    mockFetchConfig.mockResolvedValue({
      version: 5,
      config: '{ "a": 2, "settings": { "picgoCloud": { "token": "remote-token" }, "server": { "port": 36677 } } }'
    })

    const ctx = createCtx(configPath)
    const manager = new ConfigSyncManager(ctx)
    const res = await manager.sync()

    expect(res.status).toBe(SyncStatus.SUCCESS)
    expect(mockUpdateConfig).not.toHaveBeenCalled()

    const writtenLocal = parse(await fs.readFile(configPath, 'utf8')) as any
    expect(writtenLocal.settings.picgoCloud.token).toBe('local-token')
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
})
