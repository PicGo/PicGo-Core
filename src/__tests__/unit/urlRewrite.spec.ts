import { describe, expect, it, vi } from 'vitest'
import { applyUrlRewriteToImgInfo, applyUrlRewriteToOutput } from '../../utils/urlRewrite'
import type { IImgInfo, IUrlRewriteRule } from '../../types'

const createCtx = (output: IImgInfo[], rules?: IUrlRewriteRule[]) => {
  return {
    output,
    getConfig: (key?: string) => {
      if (key === 'settings.urlRewrite.rules') return rules
      return undefined
    },
    log: {
      error: vi.fn(),
      warn: vi.fn()
    }
  }
}

describe('urlRewrite', () => {
  it('no-ops silently when rules missing', () => {
    const img: IImgInfo = { imgUrl: 'https://a.com/uploads/1.png' }
    const ctx = createCtx([img], undefined)

    applyUrlRewriteToOutput(ctx)

    expect(img.imgUrl).toBe('https://a.com/uploads/1.png')
    expect(ctx.log.error).not.toHaveBeenCalled()
    expect(ctx.log.warn).not.toHaveBeenCalled()
  })

  it('enable defaults to true; explicit false skips', () => {
    const img: IImgInfo = { imgUrl: 'https://test.com/uploads/1.png' }
    const rules: IUrlRewriteRule[] = [
      { match: 'test', replace: 'prod', enable: false },
      { match: '^https://test\\.com/uploads/(.+)$', replace: 'https://cdn.test.com/$1' }
    ]

    applyUrlRewriteToImgInfo(img, rules, createCtx([], rules))

    expect(img.imgUrl).toBe('https://cdn.test.com/1.png')
  })

  it('first match wins (no chain rewrite)', () => {
    const img: IImgInfo = { imgUrl: 'https://test.com/uploads/1.png' }
    const rules: IUrlRewriteRule[] = [
      { match: '^https://test\\.com/uploads/(.+)$', replace: 'https://cdn.test.com/$1' },
      { match: 'cdn', replace: 'cdn2', global: true }
    ]

    applyUrlRewriteToImgInfo(img, rules, createCtx([], rules))

    expect(img.imgUrl).toBe('https://cdn.test.com/1.png')
  })

  it('sets originImgUrl only once when rewrite changes url', () => {
    const img: IImgInfo = { imgUrl: 'https://test.com/uploads/1.png' }
    const rules: IUrlRewriteRule[] = [
      { match: '^https://test\\.com/uploads/(.+)$', replace: 'https://cdn.test.com/$1' }
    ]

    applyUrlRewriteToImgInfo(img, rules, createCtx([], rules))
    expect(img.originImgUrl).toBe('https://test.com/uploads/1.png')

    // second rewrite should not overwrite
    applyUrlRewriteToImgInfo(img, [{ match: 'cdn', replace: 'cdn2', global: true }], createCtx([], rules))
    expect(img.originImgUrl).toBe('https://test.com/uploads/1.png')
  })

  it('supports ignoreCase and global flags mapping', () => {
    const img: IImgInfo = { imgUrl: 'https://TEST.com/uploads/a.png' }
    const rules: IUrlRewriteRule[] = [
      { match: 'test', replace: 'prod', ignoreCase: true }
    ]

    applyUrlRewriteToImgInfo(img, rules, createCtx([], rules))

    // ignoreCase affects matching, not the replacement string casing
    expect(img.imgUrl).toBe('https://prod.com/uploads/a.png')
  })

  it('global flag replaces all occurrences within a single rule', () => {
    const img: IImgInfo = { imgUrl: 'https://a.com/test/test.png' }
    const rules: IUrlRewriteRule[] = [
      { match: 'test', replace: 'x', global: true }
    ]

    applyUrlRewriteToImgInfo(img, rules, createCtx([], rules))

    expect(img.imgUrl).toBe('https://a.com/x/x.png')
  })

  it('logs error and skips on invalid regexp', () => {
    const img: IImgInfo = { imgUrl: 'https://test.com/uploads/1.png' }
    const rules: IUrlRewriteRule[] = [
      { match: '(', replace: 'x' },
      { match: 'test', replace: 'prod', global: true }
    ]
    const ctx = createCtx([], rules)

    applyUrlRewriteToImgInfo(img, rules, ctx)

    expect(ctx.log.error).toHaveBeenCalledTimes(1)
    expect(img.imgUrl).toBe('https://prod.com/uploads/1.png')
  })

  it('warns but allows empty replacement result', () => {
    const img: IImgInfo = { imgUrl: 'https://test.com/uploads/1.png' }
    const rules: IUrlRewriteRule[] = [
      { match: '^https://test\\.com/uploads/(.+)$', replace: '' }
    ]
    const ctx = createCtx([], rules)

    applyUrlRewriteToImgInfo(img, rules, ctx)

    expect(img.imgUrl).toBe('')
    expect(ctx.log.warn).toHaveBeenCalledTimes(1)
  })

  it('integration: rewrite happens before afterUpload plugin reads imgUrl', async () => {
    const calls: string[] = []

    const ctx = {
      configPath: '',
      baseDir: '',
      VERSION: 'test',
      GUI_VERSION: undefined,
      cmd: {} as any,
      Request: {} as any,
      i18n: {} as any,
      pluginLoader: {} as any,
      pluginHandler: {} as any,
      uploaderConfig: {} as any,
      input: [],
      output: [{ imgUrl: 'https://test.com/uploads/1.png' }],
      helper: {
        afterUploadPlugins: {
          getList: () => [
            {
              handle: async (ctx2: any) => {
                calls.push(`plugin-sees:${ctx2.output[0].imgUrl}`)
              }
            }
          ],
          getIdList: () => ['testPlugin'],
          getName: () => 'afterUploadPlugins'
        }
      } as any,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn()
      },
      getConfig: (key?: string) => {
        if (key === 'settings.urlRewrite.rules') {
          return [{ match: '^https://test\\.com/uploads/(.+)$', replace: 'https://cdn.test.com/$1' }]
        }
        if (key === 'settings.encodeOutputURL') return false
        return undefined
      },
      saveConfig: vi.fn(),
      removeConfig: vi.fn(),
      setConfig: vi.fn(),
      unsetConfig: vi.fn(),
      upload: vi.fn(),
      request: vi.fn(),
      addListener: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      off: vi.fn(),
      removeAllListeners: vi.fn(),
      setMaxListeners: vi.fn(),
      getMaxListeners: vi.fn(),
      listeners: vi.fn(),
      rawListeners: vi.fn(),
      emit: vi.fn(),
      listenerCount: vi.fn(),
      prependListener: vi.fn(),
      prependOnceListener: vi.fn(),
      eventNames: vi.fn()
    }

    const { Lifecycle } = await import('../../core/Lifecycle')
    const lifecycle = new Lifecycle(ctx as any)

    await (lifecycle as any).afterUpload(ctx)

    expect(calls).toEqual(['plugin-sees:https://cdn.test.com/1.png'])
  })
})
