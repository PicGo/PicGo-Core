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
  return fs.mkdtemp(path.join(os.tmpdir(), 'picgo-core-config-sync'))
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
})
