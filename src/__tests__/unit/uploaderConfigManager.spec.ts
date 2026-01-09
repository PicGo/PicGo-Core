import { afterEach, describe, expect, it, vi } from 'vitest'
import { get, set, unset } from 'lodash'
import { UploaderConfigManager } from '../../lib/UploaderConfigManager'
import type { IPicGo } from '../../types'

type ILogSpy = {
  warn: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  debug: ReturnType<typeof vi.fn>
}

const createMockCtx = (initialConfig: Record<string, unknown>, uploaderTypes: string[] = ['smms']): {
  ctx: IPicGo
  config: Record<string, unknown>
  log: ILogSpy
  saveConfigMock: ReturnType<typeof vi.fn>
} => {
  const config: Record<string, unknown> = structuredClone(initialConfig)

  const log: ILogSpy = {
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }

  const saveConfigMock = vi.fn((patch: Record<string, unknown>) => {
    for (const key of Object.keys(patch)) {
      set(config, key, patch[key])
    }
  })

  const ctx = {
    helper: {
      uploader: {
        getIdList: () => uploaderTypes
      }
    },
    log,
    getConfig: <T>(name?: string): T => {
      if (!name) return config as unknown as T
      return get(config, name) as T
    },
    saveConfig: saveConfigMock,
    setConfig: (patch: Record<string, unknown>) => {
      for (const key of Object.keys(patch)) {
        set(config, key, patch[key])
      }
    },
    removeConfig: (key: string, propName: string) => {
      unset(config, `${key}.${propName}`)
    }
  } as unknown as IPicGo

  return { ctx, config, log, saveConfigMock }
}

describe('UploaderConfigManager', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('migrates legacy picBed.<type> into uploader.<type>.configList on init and mirrors metadata back', () => {
    const { ctx, config } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms',
        smms: {
          token: 't'
        }
      },
      picgoPlugins: {}
    })

    new UploaderConfigManager(ctx)

    const list = get(config, 'uploader.smms.configList') as unknown[]
    expect(Array.isArray(list)).toBe(true)
    expect(list).toHaveLength(1)

    const item = list[0] as Record<string, unknown>
    expect(item.token).toBe('t')
    expect(typeof item._id).toBe('string')
    expect(item._configName).toBe('Default')
    expect(typeof item._createdAt).toBe('number')
    expect(typeof item._updatedAt).toBe('number')

    const defaultId = get(config, 'uploader.smms.defaultId')
    expect(defaultId).toBe(item._id)

    const mirrored = get(config, 'picBed.smms') as Record<string, unknown>
    expect(mirrored.token).toBe('t')
    expect(mirrored._id).toBe(item._id)
    expect(mirrored._configName).toBe('Default')
    expect(mirrored._createdAt).toBe(item._createdAt)
    expect(mirrored._updatedAt).toBe(item._updatedAt)
  })

  it('skips init writes when config is already valid and mirrored', () => {
    const base = {
      token: 'a',
      _configName: 'Default',
      _id: '1',
      _createdAt: 1,
      _updatedAt: 1
    }

    const { ctx, saveConfigMock } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms',
        smms: base
      },
      picgoPlugins: {},
      uploader: {
        smms: {
          configList: [base],
          defaultId: '1'
        }
      }
    }, ['smms'])

    new UploaderConfigManager(ctx)

    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('normalizes duplicate config names (case-insensitive) during init', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)

    const { ctx, config } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms'
      },
      picgoPlugins: {},
      uploader: {
        smms: {
          configList: [
            { _id: '1', _configName: 'Work', _createdAt: 1, _updatedAt: 1, token: 'a' },
            { _id: '2', _configName: 'work', _createdAt: 1, _updatedAt: 1, token: 'b' }
          ],
          defaultId: '2'
        }
      }
    }, ['smms'])

    new UploaderConfigManager(ctx)

    const list = get(config, 'uploader.smms.configList') as Array<Record<string, unknown>>
    const names = list.map(item => String(item._configName))
    expect(names).toEqual(['Work', 'work-1'])

    const mirrored = get(config, 'picBed.smms') as Record<string, unknown>
    expect(mirrored._configName).toBe('work-1')
    expect(mirrored._id).toBe('2')
  })

  it('use() creates a metadata-only config when none exist', () => {
    const { ctx, config } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms'
      },
      picgoPlugins: {}
    }, ['smms'])

    const manager = new UploaderConfigManager(ctx)
    manager.use('smms')

    const list = get(config, 'uploader.smms.configList') as unknown[]
    expect(Array.isArray(list)).toBe(true)
    expect(list).toHaveLength(1)
    expect(get(config, 'picBed.smms._configName')).toBe('Default')
  })

  it('createOrUpdate() updates existing config by name (case-insensitive) and preserves stored casing', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000)

    const { ctx, config } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms',
        smms: { token: 'a' }
      },
      picgoPlugins: {},
      uploader: {
        smms: {
          configList: [
            { _id: '1', _configName: 'Work', _createdAt: 1, _updatedAt: 1, token: 'a' }
          ],
          defaultId: '1'
        }
      }
    }, ['smms'])

    const manager = new UploaderConfigManager(ctx)
    manager.createOrUpdate('smms', 'work', { token: 'b' })

    const list = get(config, 'uploader.smms.configList') as Array<Record<string, unknown>>
    expect(list).toHaveLength(1)
    expect(list[0]._id).toBe('1')
    expect(list[0]._configName).toBe('Work')
    expect(list[0].token).toBe('b')
    expect(list[0]._updatedAt).toBe(2000)

    const mirrored = get(config, 'picBed.smms') as Record<string, unknown>
    expect(mirrored._configName).toBe('Work')
    expect(mirrored.token).toBe('b')
  })

  it('remove() clears picBed.<type> when deleting the last config and warns if it is current', () => {
    const { ctx, config, log } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms',
        smms: { token: 'a' }
      },
      picgoPlugins: {},
      uploader: {
        smms: {
          configList: [
            { _id: '1', _configName: 'Default', _createdAt: 1, _updatedAt: 1, token: 'a' }
          ],
          defaultId: '1'
        }
      }
    }, ['smms'])

    const manager = new UploaderConfigManager(ctx)
    manager.remove('smms', 'default')

    expect(get(config, 'uploader.smms.configList')).toEqual([])
    expect(get(config, 'picBed.smms')).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('copy() duplicates a config without switching current uploader', () => {
    vi.spyOn(Date, 'now').mockReturnValue(3000)

    const base = {
      token: 'a',
      _configName: 'Default',
      _id: '1',
      _createdAt: 1,
      _updatedAt: 1
    }

    const { ctx, config } = createMockCtx({
      picBed: {
        current: 'smms',
        uploader: 'smms',
        smms: base
      },
      picgoPlugins: {},
      uploader: {
        smms: {
          configList: [base],
          defaultId: '1'
        }
      }
    }, ['smms'])

    const manager = new UploaderConfigManager(ctx)
    const copied = manager.copy('smms', 'default', 'Work')

    const list = get(config, 'uploader.smms.configList') as Array<Record<string, unknown>>
    expect(list).toHaveLength(2)
    expect(get(config, 'uploader.smms.defaultId')).toBe('1')

    expect(get(config, 'picBed.current')).toBe('smms')
    expect(get(config, 'picBed.uploader')).toBe('smms')

    const mirror = get(config, 'picBed.smms') as Record<string, unknown>
    expect(mirror._id).toBe('1')
    expect(mirror._configName).toBe('Default')
    expect(mirror.token).toBe('a')

    expect(copied._id).not.toBe('1')
    expect(copied._configName).toBe('Work')
    expect(copied._createdAt).toBe(3000)
    expect(copied._updatedAt).toBe(3000)

    const created = list.find(item => item._id === copied._id)
    expect(created).toBeTruthy()
    expect(created?.token).toBe('a')
  })
})
