import { describe, expect, it, vi } from 'vitest'
import {
  resolveUploadOptions,
  UploadSelectionError,
  UploadSelectionErrorCode
} from '../../lib/UploadSelection'
import type { IPicGo, IUploaderConfigItem, UploadSelection } from '../../types'

const createConfig = (
  id: string,
  name: string,
  values: Record<string, unknown> = {}
): IUploaderConfigItem => ({
  _id: id,
  _configName: name,
  _createdAt: 1,
  _updatedAt: 1,
  ...values
})

const createCtx = (
  configs: Record<string, IUploaderConfigItem[]>,
  options: {
    registeredTypes?: string[]
    activeConfigs?: Record<string, IUploaderConfigItem | undefined>
  } = {}
): {
  ctx: IPicGo
  getConfigList: ReturnType<typeof vi.fn>
  getActiveConfig: ReturnType<typeof vi.fn>
  translate: ReturnType<typeof vi.fn>
} => {
  const registeredTypes = options.registeredTypes ?? Object.keys(configs)
  const getConfigList = vi.fn((type: string): IUploaderConfigItem[] => configs[type] ?? [])
  const getActiveConfig = vi.fn((type: string): IUploaderConfigItem | undefined => {
    return options.activeConfigs?.[type]
  })
  const translate = vi.fn((key: string, args?: Record<string, string>): string => {
    const details = Object.entries(args ?? {}).map(([name, value]) => `${name}=${value}`).join(';')
    return `${key}:${details}`
  })
  const ctx = {
    uploaderConfig: {
      listUploaderTypes: () => registeredTypes,
      getConfigList,
      getActiveConfig
    },
    i18n: { translate }
  } as unknown as IPicGo
  return { ctx, getConfigList, getActiveConfig, translate }
}

const captureSelectionError = (callback: () => unknown): UploadSelectionError => {
  try {
    callback()
  } catch (error: unknown) {
    if (error instanceof UploadSelectionError) return error
    throw error
  }
  throw new Error('Expected UploadSelectionError')
}

describe('resolveUploadOptions', () => {
  it('preserves existing behavior when no selector is supplied', () => {
    const { ctx, getConfigList, getActiveConfig } = createCtx({ smms: [] })

    expect(resolveUploadOptions(ctx)).toBeUndefined()
    expect(resolveUploadOptions(ctx, {})).toBeUndefined()
    expect(getConfigList).not.toHaveBeenCalled()
    expect(getActiveConfig).not.toHaveBeenCalled()
  })

  it.each([
    ['uploader', ''],
    ['uploader', '   '],
    ['configName', 42],
    ['configId', null]
  ])('rejects malformed %s selectors', (parameter, value) => {
    const { ctx, translate } = createCtx({ smms: [] })
    const selection = { [parameter]: value } as unknown as UploadSelection

    const error = captureSelectionError(() => resolveUploadOptions(ctx, selection))

    expect(error.code).toBe(UploadSelectionErrorCode.InvalidSelection)
    expect(translate).toHaveBeenCalledWith('UPLOAD_SELECTION_INVALID_PARAMETER', { parameter })
  })

  it('rejects an unregistered explicit uploader before reading configurations', () => {
    const { ctx, getConfigList } = createCtx({ smms: [] })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, {
      uploader: 'github',
      configName: 'Work'
    }))

    expect(error.code).toBe(UploadSelectionErrorCode.UnknownUploader)
    expect(error.message).toContain('uploader=github')
    expect(error.message).toContain('uploaders=[smms]')
    expect(getConfigList).not.toHaveBeenCalled()
  })

  it('matches a scoped name after trimming and without case sensitivity, returning a deep clone', () => {
    const stored = createConfig('smms-1', 'Work Account', {
      token: 'secret',
      nested: { endpoint: 'original' }
    })
    const { ctx } = createCtx({ smms: [stored], github: [] })

    const resolved = resolveUploadOptions(ctx, {
      uploader: 'smms',
      configName: '  work ACCOUNT  '
    })

    expect(resolved).toEqual({ uploader: 'smms', config: stored })
    expect(resolved?.config).not.toBe(stored)
    expect(resolved?.config?.nested).not.toBe(stored.nested)
    const resolvedNested = resolved?.config?.nested as { endpoint: string }
    resolvedNested.endpoint = 'changed'
    expect(stored.nested).toEqual({ endpoint: 'original' })
  })

  it('finds a globally unique name only among registered uploader types', () => {
    const githubWork = createConfig('github-1', 'Work')
    const { ctx, getConfigList } = createCtx({
      smms: [createConfig('smms-1', 'Personal')],
      github: [githubWork],
      unregistered: [createConfig('hidden-1', 'Work')]
    }, { registeredTypes: ['smms', 'github'] })

    expect(resolveUploadOptions(ctx, { configName: 'work' })).toEqual({
      uploader: 'github',
      config: githubWork
    })
    expect(getConfigList).not.toHaveBeenCalledWith('unregistered')
  })

  it('reports matching uploader types when a global name is ambiguous', () => {
    const { ctx } = createCtx({
      smms: [createConfig('smms-1', 'Work', { token: 'smms-secret' })],
      github: [createConfig('github-1', 'work', { token: 'github-secret' })]
    })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, { configName: 'Work' }))

    expect(error.code).toBe(UploadSelectionErrorCode.AmbiguousConfig)
    expect(error.message).toContain('smms/Work (smms-1)')
    expect(error.message).toContain('github/work (github-1)')
    expect(error.message).not.toContain('smms-secret')
    expect(error.message).not.toContain('github-secret')
  })

  it('gives a unique exact ID match precedence over a different name', () => {
    const byId = createConfig('stable-id', 'Personal')
    const byName = createConfig('other-id', 'Work')
    const { ctx } = createCtx({ smms: [byId, byName] })

    expect(resolveUploadOptions(ctx, {
      configId: 'stable-id',
      configName: 'Work'
    })).toEqual({ uploader: 'smms', config: byId })
  })

  it.each([
    ['a missing ID', 'missing-id'],
    ['an ambiguous ID', 'duplicate-id']
  ])('falls back to a unique name after %s', (_label, configId) => {
    const target = createConfig('target-id', 'Backup')
    const { ctx } = createCtx({
      smms: [createConfig('duplicate-id', 'Personal'), target],
      github: [createConfig('duplicate-id', 'Work')]
    })

    expect(resolveUploadOptions(ctx, { configId, configName: 'backup' })).toEqual({
      uploader: 'smms',
      config: target
    })
  })

  it('reports an ambiguous ID when no fallback name is supplied', () => {
    const { ctx } = createCtx({
      smms: [createConfig('duplicate-id', 'Personal')],
      github: [createConfig('duplicate-id', 'Work')]
    })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, { configId: 'duplicate-id' }))

    expect(error.code).toBe(UploadSelectionErrorCode.AmbiguousConfig)
  })

  it('includes the attempted ID when its name fallback is ambiguous', () => {
    const { ctx } = createCtx({
      smms: [createConfig('duplicate-id', 'Work')],
      github: [createConfig('duplicate-id', 'work')]
    })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, {
      configId: 'duplicate-id',
      configName: 'Work'
    }))

    expect(error.code).toBe(UploadSelectionErrorCode.AmbiguousConfig)
    expect(error.message).toContain('selector=configId="duplicate-id", configName="Work"')
  })

  it('matches IDs exactly without trimming', () => {
    const { ctx } = createCtx({ smms: [createConfig('stable-id', 'Personal')] })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, { configId: ' stable-id ' }))

    expect(error.code).toBe(UploadSelectionErrorCode.ConfigNotFound)
  })

  it('reports all attempted selectors and scope when no configuration matches', () => {
    const { ctx } = createCtx({ smms: [] })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, {
      uploader: 'smms',
      configId: 'missing-id',
      configName: 'Missing'
    }))

    expect(error.code).toBe(UploadSelectionErrorCode.ConfigNotFound)
    expect(error.message).toContain('selectors=configId="missing-id", configName="Missing"')
    expect(error.message).toContain('scope=uploader="smms"')
  })

  it('uses the existing active-config behavior for uploader-only selection and clones the result', () => {
    const active = createConfig('active-id', 'Active', { nested: { region: 'one' } })
    const { ctx, getConfigList, getActiveConfig } = createCtx({ smms: [] }, {
      activeConfigs: { smms: active }
    })

    const resolved = resolveUploadOptions(ctx, { uploader: 'smms' })

    expect(resolved).toEqual({ uploader: 'smms', config: active })
    expect(resolved?.config).not.toBe(active)
    expect(resolved?.config?.nested).not.toBe(active.nested)
    expect(getActiveConfig).toHaveBeenCalledWith('smms')
    expect(getConfigList).not.toHaveBeenCalled()
  })

  it('rejects uploader-only selection when a regular uploader has no active profile', () => {
    const { ctx } = createCtx({ smms: [] })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, { uploader: 'smms' }))

    expect(error.code).toBe(UploadSelectionErrorCode.ConfigNotFound)
  })

  it('allows PicGo Cloud uploader-only selection without a saved profile', () => {
    const { ctx } = createCtx({ 'picgo-cloud': [] })

    expect(resolveUploadOptions(ctx, { uploader: 'picgo-cloud' })).toEqual({
      uploader: 'picgo-cloud'
    })
  })

  it('still rejects an explicitly requested missing PicGo Cloud profile', () => {
    const { ctx } = createCtx({ 'picgo-cloud': [] })

    const error = captureSelectionError(() => resolveUploadOptions(ctx, {
      uploader: 'picgo-cloud',
      configName: 'Missing'
    }))

    expect(error.code).toBe(UploadSelectionErrorCode.ConfigNotFound)
  })
})
