import { describe, it, expect, vi } from 'vitest'
import { Lifecycle } from '../../core/Lifecycle'
import type { IPicGo } from '../../types'
import { IBuildInEvent } from '../../utils/enum'

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

const createLifecyclePlugins = (plugins: Array<{ handle: (ctx: IPicGo) => Promise<void> | void }>, name: string) => {
  return {
    getList: () => plugins,
    getIdList: () => plugins.map((_, index) => `${name}-${index}`),
    getName: () => name
  }
}

const createTestCtx = (overrides?: {
  uploaderHandle?: (ctx: IPicGo) => Promise<void>
  afterUploadPlugins?: Array<{ handle: (ctx: IPicGo) => Promise<void> | void }>
}): IPicGo => {
  const defaultUploader = async (ctx: IPicGo): Promise<void> => {
    for (const img of ctx.output) {
      img.imgUrl = `https://uploaded.com/${img.fileName}`
    }
  }

  const emitFn = vi.fn()
  const logSuccess = vi.fn()

  const ctx = {
    output: [],
    input: [],
    configPath: '/tmp/test-config.json',
    baseDir: '/tmp',
    VERSION: '3.0.0',
    helper: {
      transformer: {
        get: () => ({
          handle: async (innerCtx: IPicGo) => {
            innerCtx.output = innerCtx.input.map((item: string, index: number) => ({
              buffer: Buffer.from('test'),
              fileName: typeof item === 'string' ? item.split('/').pop() : `img-${index}.png`,
              extname: '.png',
              origin: item
            }))
          }
        })
      },
      uploader: {
        get: () => ({
          handle: overrides?.uploaderHandle ?? defaultUploader
        })
      },
      beforeTransformPlugins: createLifecyclePlugins([], 'beforeTransformPlugins'),
      beforeUploadPlugins: createLifecyclePlugins([], 'beforeUploadPlugins'),
      afterUploadPlugins: createLifecyclePlugins(overrides?.afterUploadPlugins ?? [], 'afterUploadPlugins'),
      afterFinishPlugins: createLifecyclePlugins([], 'afterFinishPlugins')
    },
    // Use real functions that we can spy on — createContext uses .bind(ctx)
    // so the bound versions still call through to these
    emit: emitFn,
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    getConfig: vi.fn((key?: string) => {
      if (key === 'settings.encodeOutputURL') return false
      return undefined
    }),
    setConfig: vi.fn(),
    saveConfig: vi.fn(),
    removeConfig: vi.fn(),
    unsetConfig: vi.fn(),
    upload: vi.fn(),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: logSuccess,
      debug: vi.fn(),
      createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn()
      }))
    },
    i18n: { translate: vi.fn((key: string) => key) },
    cmd: { inquirer: {} },
    Request: { request: vi.fn() },
    request: vi.fn(),
    pluginLoader: {},
    pluginHandler: {},
    openUrl: vi.fn(),
    server: {},
    cloud: {},
    uploaderConfig: {},
    addListener: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    setMaxListeners: vi.fn(),
    getMaxListeners: vi.fn(),
    listeners: vi.fn(),
    rawListeners: vi.fn(),
    listenerCount: vi.fn(),
    prependListener: vi.fn(),
    prependOnceListener: vi.fn(),
    eventNames: vi.fn()
  } as unknown as IPicGo

  return ctx
}

// Helper: since createContext binds emit/log from the original ctx,
// we check the original ctx's mocks, not the returned ctx's.
const getEmitMock = (ctx: IPicGo) => ctx.emit as ReturnType<typeof vi.fn>
const getLogSuccess = (ctx: IPicGo) => ctx.log.success as ReturnType<typeof vi.fn>

describe('Lifecycle partial upload failure', () => {
  it('runs afterUpload normally when all uploads succeed', async () => {
    const ctx = createTestCtx()
    const lifecycle = new Lifecycle(ctx)

    await lifecycle.start(['/path/a.png', '/path/b.png'])
    const emit = getEmitMock(ctx)

    expect(emit).toHaveBeenCalledWith(IBuildInEvent.FINISHED, expect.anything())
    expect(emit).not.toHaveBeenCalledWith(IBuildInEvent.FAILED, expect.anything())

    const successLog = getLogSuccess(ctx)
    expect(successLog).toHaveBeenCalledWith(expect.stringContaining('https://uploaded.com/a.png'))
    expect(successLog).toHaveBeenCalledWith(expect.stringContaining('https://uploaded.com/b.png'))
  })

  it('still runs afterUpload when upload partially fails', async () => {
    const ctx = createTestCtx({
      uploaderHandle: async (innerCtx: IPicGo) => {
        // First item succeeds, second fails
        innerCtx.output[0].imgUrl = 'https://uploaded.com/a.png'
        throw new Error('upload failed for second image')
      }
    })
    const lifecycle = new Lifecycle(ctx)

    await lifecycle.start(['/path/a.png', '/path/b.png'])
    const emit = getEmitMock(ctx)

    // FINISHED should fire (afterUpload ran for partial success)
    expect(emit).toHaveBeenCalledWith(IBuildInEvent.FINISHED, expect.anything())
    // FAILED should also fire
    expect(emit).toHaveBeenCalledWith(IBuildInEvent.FAILED, expect.any(Error))

    // Success log should include the URL that worked
    const successLog = getLogSuccess(ctx)
    expect(successLog).toHaveBeenCalledWith(expect.stringContaining('https://uploaded.com/a.png'))
  })

  it('does not run afterUpload when all uploads fail (no imgUrl)', async () => {
    const ctx = createTestCtx({
      uploaderHandle: async () => {
        throw new Error('all uploads failed')
      }
    })
    const lifecycle = new Lifecycle(ctx)

    await lifecycle.start(['/path/a.png', '/path/b.png'])
    const emit = getEmitMock(ctx)

    // FINISHED should NOT fire
    expect(emit).not.toHaveBeenCalledWith(IBuildInEvent.FINISHED, expect.anything())
    // FAILED should fire
    expect(emit).toHaveBeenCalledWith(IBuildInEvent.FAILED, expect.any(Error))
  })

  it('does not re-run afterUpload when afterUpload itself fails', async () => {
    let afterUploadPluginCallCount = 0
    const ctx = createTestCtx({
      afterUploadPlugins: [{
        handle: async () => {
          afterUploadPluginCallCount++
          throw new Error('afterUpload plugin error')
        }
      }]
    })
    const lifecycle = new Lifecycle(ctx)

    await lifecycle.start(['/path/a.png'])
    const emit = getEmitMock(ctx)

    // afterUploadPlugin called exactly once
    expect(afterUploadPluginCallCount).toBe(1)
    // FAILED should fire
    expect(emit).toHaveBeenCalledWith(IBuildInEvent.FAILED, expect.any(Error))
  })

  it('does not run afterUpload when error occurs before doUpload', async () => {
    const ctx = createTestCtx()
    ;(ctx.helper as any).beforeUploadPlugins = createLifecyclePlugins([{
      handle: async () => {
        throw new Error('beforeUpload error')
      }
    }], 'beforeUploadPlugins')
    const lifecycle = new Lifecycle(ctx)

    await lifecycle.start(['/path/a.png'])
    const emit = getEmitMock(ctx)

    // FINISHED should NOT fire
    expect(emit).not.toHaveBeenCalledWith(IBuildInEvent.FINISHED, expect.anything())
    // FAILED should fire
    expect(emit).toHaveBeenCalledWith(IBuildInEvent.FAILED, expect.any(Error))
  })
})
