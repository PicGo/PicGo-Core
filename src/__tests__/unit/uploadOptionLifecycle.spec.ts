import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PicGo } from '../../core/PicGo'
import { Lifecycle } from '../../core/Lifecycle'
import { UploadOptionErrorCode } from '../../lib/UploadOption'
import type { IImgInfo, IPicGo, IUploaderConfigItem } from '../../types'
import { createClipboardImagePath } from '../../utils/createClipboardImagePath'

const { getClipboardImageMock } = vi.hoisted(() => ({
  getClipboardImageMock: vi.fn()
}))

vi.mock('../../utils/getClipboardImage', () => {
  return { getClipboardImage: getClipboardImageMock }
})

vi.mock('ora', () => {
  const mockSpinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    isSpinning: false,
    text: ''
  }
  return { default: () => mockSpinner }
})

interface ITestProfile extends IUploaderConfigItem {
  endpoint: string
}

interface ITestHarness {
  picgo: PicGo
  configPath: string
  directory: string
  profiles: {
    alphaOne: ITestProfile
    alphaTwo: ITestProfile
    betaOne: ITestProfile
  }
}

interface IDeferred {
  promise: Promise<void>
  resolve: () => void
}

const temporaryDirectories: string[] = []

const createDeferred = (): IDeferred => {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: () => resolvePromise?.()
  }
}

const readConfigFile = (configPath: string): Record<string, unknown> => {
  return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
}

const createHarness = (): ITestHarness => {
  const directory = mkdtempSync(path.join(tmpdir(), 'picgo-upload-option-'))
  temporaryDirectories.push(directory)
  const configPath = path.join(directory, 'config.json')
  const alphaOne: ITestProfile = {
    _id: 'alpha-one',
    _configName: 'Alpha One',
    _createdAt: 1,
    _updatedAt: 1,
    endpoint: 'alpha-one.example'
  }
  const alphaTwo: ITestProfile = {
    _id: 'alpha-two',
    _configName: 'Alpha Two',
    _createdAt: 2,
    _updatedAt: 2,
    endpoint: 'alpha-two.example'
  }
  const betaOne: ITestProfile = {
    _id: 'beta-one',
    _configName: 'Beta One',
    _createdAt: 3,
    _updatedAt: 3,
    endpoint: 'beta-one.example'
  }
  const initialConfig = {
    picBed: {
      uploader: 'alpha',
      current: 'alpha',
      transformer: 'option-test',
      alpha: alphaOne,
      beta: betaOne
    },
    uploader: {
      alpha: {
        configList: [alphaOne, alphaTwo],
        defaultId: alphaOne._id
      },
      beta: {
        configList: [betaOne],
        defaultId: betaOne._id
      }
    },
    pluginState: {
      removeMe: 'root-value'
    },
    picgoPlugins: {},
    silent: true,
    debug: false
  }
  writeFileSync(configPath, JSON.stringify(initialConfig), 'utf8')

  const picgo = new PicGo(configPath)
  picgo.helper.transformer.register('option-test', {
    handle: async (ctx: IPicGo) => {
      ctx.output = ctx.input.map((item: unknown, index: number): IImgInfo => ({
        buffer: Buffer.from(`image-${index}`),
        fileName: typeof item === 'string' ? item : `image-${index}.png`,
        origin: typeof item === 'string' ? item : undefined
      }))
    }
  })

  return {
    picgo,
    configPath,
    directory,
    profiles: { alphaOne, alphaTwo, betaOne }
  }
}

const registerEndpointUploader = (picgo: PicGo, type: 'alpha' | 'beta'): void => {
  picgo.helper.uploader.register(type, {
    handle: async (ctx: IPicGo) => {
      const profile = ctx.getConfig<ITestProfile>(`picBed.${type}`)
      for (const item of ctx.output) {
        item.imgUrl = `https://${profile.endpoint}/${item.fileName}`
      }
    }
  })
}

afterEach(async () => {
  getClipboardImageMock.mockReset()
  vi.restoreAllMocks()
  await new Promise(resolve => setTimeout(resolve, 20))
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true })
  }
})

describe('per-upload option lifecycle isolation', () => {
  it('rejects invalid SDK option before reading the clipboard', async () => {
    const { picgo } = createHarness()

    await expect(picgo.upload(undefined, { uploader: 'missing-uploader' })).rejects.toMatchObject({
      code: UploadOptionErrorCode.UnknownUploader
    })
    expect(getClipboardImageMock).not.toHaveBeenCalled()
  })

  it('uses isolated option for SDK and direct Lifecycle calls without changing root or disk config', async () => {
    const { picgo, configPath } = createHarness()
    registerEndpointUploader(picgo, 'alpha')
    registerEndpointUploader(picgo, 'beta')
    const rootBefore = structuredClone(picgo.getConfig<Record<string, unknown>>())
    const diskBefore = readConfigFile(configPath)

    const sdkOutput = await picgo.upload(['sdk.png'], { uploader: 'alpha', configId: 'alpha-two' })
    const directContext = await new Lifecycle(picgo).start(['direct.png'], { uploader: 'beta', configName: ' beta one ' })

    expect(sdkOutput).toMatchObject([{ imgUrl: 'https://alpha-two.example/sdk.png', type: 'alpha' }])
    expect(directContext.output).toMatchObject([{ imgUrl: 'https://beta-one.example/direct.png', type: 'beta' }])
    expect(picgo.getConfig<Record<string, unknown>>()).toEqual(rootBefore)
    expect(readConfigFile(configPath)).toEqual(diskBefore)
  })

  it('keeps temporary config mutations local and mirrors only explicit persistence into the local view', async () => {
    const { picgo, configPath } = createHarness()
    const observed: Record<string, unknown> = {}

    picgo.helper.beforeUploadPlugins.register('option-mutations', {
      handle: async (ctx: IPicGo) => {
        ctx.setConfig({
          'temporary.keep': true,
          'temporary.remove': 'local-only'
        })
        ctx.unsetConfig('temporary', 'remove')

        const persistedValue = { status: 'saved' }
        ctx.saveConfig({ 'pluginState.persisted': persistedValue })
        persistedValue.status = 'caller-mutated'
        const localPersisted = ctx.getConfig<{ status: string }>('pluginState.persisted')
        observed.localAfterSave = localPersisted.status
        localPersisted.status = 'local-mutated'

        ctx.removeConfig('pluginState', 'removeMe')
        observed.temporary = ctx.getConfig('temporary')
        observed.removed = ctx.getConfig('pluginState.removeMe')
        observed.selectedEndpoint = ctx.getConfig('picBed.alpha.endpoint')
      }
    })
    registerEndpointUploader(picgo, 'alpha')

    await picgo.upload(['mutations.png'], { uploader: 'alpha', configName: 'Alpha Two' })

    expect(observed).toEqual({
      localAfterSave: 'saved',
      temporary: { keep: true },
      removed: undefined,
      selectedEndpoint: 'alpha-two.example'
    })
    expect(picgo.getConfig('temporary')).toBeUndefined()
    expect(picgo.getConfig('pluginState.persisted')).toEqual({ status: 'saved' })
    expect(picgo.getConfig('pluginState.removeMe')).toBeUndefined()
    expect(picgo.getConfig('picBed.uploader')).toBe('alpha')
    expect(picgo.getConfig('picBed.alpha.endpoint')).toBe('alpha-one.example')
    expect(readConfigFile(configPath)).toMatchObject({
      pluginState: {
        persisted: { status: 'saved' }
      }
    })
  })

  it('preserves partial-success after-upload handling while another selected upload is in afterUpload', async () => {
    const { picgo } = createHarness()
    const alphaUploaderEntered = createDeferred()
    const throwAlpha = createDeferred()
    const betaAfterUploadEntered = createDeferred()
    const finishBeta = createDeferred()
    const afterUploadTypes: string[] = []
    const seenEndpoints: string[] = []

    picgo.helper.uploader.register('alpha', {
      handle: async (ctx: IPicGo) => {
        seenEndpoints.push(ctx.getConfig('picBed.alpha.endpoint'))
        ctx.output[0].imgUrl = 'https://alpha-two.example/partial.png'
        alphaUploaderEntered.resolve()
        await throwAlpha.promise
        throw new Error('alpha second item failed')
      }
    })
    picgo.helper.uploader.register('beta', {
      handle: async (ctx: IPicGo) => {
        await alphaUploaderEntered.promise
        seenEndpoints.push(ctx.getConfig('picBed.beta.endpoint'))
        ctx.output[0].imgUrl = 'https://beta-one.example/complete.png'
      }
    })
    picgo.helper.afterUploadPlugins.register('concurrency-observer', {
      handle: async (ctx: IPicGo) => {
        const type = ctx.getConfig<string>('picBed.uploader')
        afterUploadTypes.push(type)
        if (type === 'beta') {
          betaAfterUploadEntered.resolve()
          await finishBeta.promise
        }
      }
    })

    const alphaUpload = picgo.upload(['partial.png', 'failed.png'], { uploader: 'alpha', configName: 'Alpha Two' })
    const betaUpload = picgo.upload(['complete.png'], { uploader: 'beta' })
    await betaAfterUploadEntered.promise
    throwAlpha.resolve()
    const alphaOutput = await alphaUpload

    if (alphaOutput instanceof Error) throw alphaOutput
    expect(alphaOutput[0]).toMatchObject({ imgUrl: 'https://alpha-two.example/partial.png' })
    expect(afterUploadTypes).toContain('alpha')

    finishBeta.resolve()
    await expect(betaUpload).resolves.toMatchObject([{ imgUrl: 'https://beta-one.example/complete.png', type: 'beta' }])
    expect(seenEndpoints).toEqual(expect.arrayContaining(['alpha-two.example', 'beta-one.example']))
  })

  it('retains legacy shared-config behavior when no selectors are supplied', async () => {
    const { picgo } = createHarness()
    picgo.helper.beforeUploadPlugins.register('legacy-mutation', {
      handle: async (ctx: IPicGo) => {
        ctx.setConfig({ 'legacy.temporary': 'shared' })
      }
    })
    registerEndpointUploader(picgo, 'alpha')

    const output = await picgo.upload(['legacy.png'])

    expect(output).toMatchObject([{ imgUrl: 'https://alpha-one.example/legacy.png', type: 'alpha' }])
    expect(picgo.getConfig('legacy.temporary')).toBe('shared')
  })

  it('generates a unique clipboard path for concurrent captures in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    const first = createClipboardImagePath('/tmp/picgo')
    const second = createClipboardImagePath('/tmp/picgo')

    expect(first).not.toBe(second)
    expect(path.basename(first)).toMatch(/^\d{17}-[0-9a-f-]+\.png$/)
    expect(path.dirname(first)).toBe(path.join('/tmp/picgo', 'picgo-clipboard-images'))
  })

  it('cleans only the clipboard file owned by each overlapping upload', async () => {
    const { picgo, directory } = createHarness()
    const firstPath = path.join(directory, 'first-clipboard.png')
    const secondPath = path.join(directory, 'second-clipboard.png')
    writeFileSync(firstPath, 'first', 'utf8')
    writeFileSync(secondPath, 'second', 'utf8')
    getClipboardImageMock
      .mockResolvedValueOnce({ imgPath: firstPath, shouldKeepAfterUploading: false })
      .mockResolvedValueOnce({ imgPath: secondPath, shouldKeepAfterUploading: false })

    const firstEntered = createDeferred()
    const secondEntered = createDeferred()
    const finishFirst = createDeferred()
    const failSecond = createDeferred()
    picgo.helper.uploader.register('alpha', {
      handle: async (ctx: IPicGo) => {
        const origin = ctx.output[0].origin
        if (origin === firstPath) {
          firstEntered.resolve()
          await finishFirst.promise
          ctx.output[0].imgUrl = 'https://alpha-one.example/first.png'
          return
        }
        secondEntered.resolve()
        await failSecond.promise
        throw new Error('second clipboard upload failed')
      }
    })

    const firstUpload = picgo.upload()
    const secondUpload = picgo.upload()
    await Promise.all([firstEntered.promise, secondEntered.promise])
    expect(existsSync(firstPath)).toBe(true)
    expect(existsSync(secondPath)).toBe(true)

    finishFirst.resolve()
    await firstUpload
    expect(existsSync(firstPath)).toBe(false)
    expect(existsSync(secondPath)).toBe(true)

    failSecond.resolve()
    await secondUpload
    expect(existsSync(secondPath)).toBe(false)
  })

  it('retains clipboard files that were not created by PicGo', async () => {
    const { picgo, directory } = createHarness()
    const retainedPath = path.join(directory, 'copied-source.png')
    writeFileSync(retainedPath, 'source', 'utf8')
    getClipboardImageMock.mockResolvedValue({
      imgPath: retainedPath,
      shouldKeepAfterUploading: true
    })
    registerEndpointUploader(picgo, 'alpha')

    await picgo.upload()

    expect(existsSync(retainedPath)).toBe(true)
  })
})
