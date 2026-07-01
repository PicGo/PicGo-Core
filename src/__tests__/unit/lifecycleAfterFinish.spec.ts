import { describe, expect, it, vi } from 'vitest'
import { Lifecycle } from '../../core/Lifecycle'
import type { IPicGo } from '../../types'

const createLifecyclePlugins = (plugins: Array<{ handle: (ctx: IPicGo) => Promise<void> | void }>, name: string) => {
  return {
    getList: () => plugins,
    getIdList: () => plugins.map((_, index) => `${name}-${index}`),
    getName: () => name
  }
}

describe('Lifecycle afterFinishPlugins', () => {
  it('logs upload success before waiting for afterFinishPlugins', async () => {
    let resolveAfterFinish: (() => void) | undefined
    const afterFinishPromise = new Promise<void>((resolve) => {
      resolveAfterFinish = resolve
    })

    const ctx = {
      output: [{
        imgUrl: 'https://img.example.com/1.png',
        buffer: Buffer.from('image-data'),
        base64Image: 'aGVsbG8='
      }],
      helper: {
        afterUploadPlugins: createLifecyclePlugins([], 'afterUploadPlugins'),
        afterFinishPlugins: createLifecyclePlugins([{
          handle: async () => {
            await afterFinishPromise
          }
        }], 'afterFinishPlugins')
      },
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getConfig: vi.fn((key?: string) => {
        if (key === 'settings.encodeOutputURL') {
          return false
        }
        return undefined
      }),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn()
      }
    } as unknown as IPicGo

    const lifecycle = new Lifecycle(ctx)
    const afterUploadPromise = (lifecycle as unknown as { afterUpload: (ctx: IPicGo) => Promise<IPicGo> }).afterUpload(ctx)

    await new Promise((resolve) => setImmediate(resolve))

    expect(ctx.log.success).toHaveBeenCalledWith('\nhttps://img.example.com/1.png')

    resolveAfterFinish?.()
    await expect(afterUploadPromise).resolves.toBe(ctx)
  })
})
