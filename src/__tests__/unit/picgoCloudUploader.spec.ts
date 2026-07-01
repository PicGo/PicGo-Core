import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPicGo } from '../../types'
import { AuthRequestClient } from '../../lib/Cloud/Request'
import { registerPicGoCloudUploader } from '../../plugins/uploader/picgoCloud'
import { IBuildInEvent } from '../../utils/enum'
import { PICGO_CLOUD, PICGO_CLOUD_IMPORT_LOG_FILE } from '../../utils/static'

type II18nMock = {
  translate: ReturnType<typeof vi.fn>
}

type IRegisteredUploader = {
  name: string
  handle: (ctx: IPicGo) => Promise<IPicGo>
  config?: () => unknown[]
}

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true
    })
  }
})

const createI18n = (): II18nMock => {
  return {
    translate: vi.fn((key: string) => {
      if (key === 'PICGO_CLOUD_UPLOAD_LOGIN_REQUIRED') {
        return '请先登录 PicGo Cloud 后再使用该图床。'
      }
      if (key === 'PICGO_CLOUD_UPLOAD_RELOGIN_REQUIRED') {
        return 'PicGo Cloud 登录状态已失效，请重新登录后再试。'
      }
      if (key === 'PICGO_CLOUD_UPLOAD_INVALID_PRESIGN_RESPONSE') {
        return 'PicGo Cloud 返回的上传凭证无效。'
      }
      if (key === 'PICGO_CLOUD_UPLOAD_INVALID_COMPLETE_RESPONSE') {
        return 'PicGo Cloud 返回的完成上传响应无效。'
      }
      if (key === 'PICGO_CLOUD_UPLOAD_MISSING_FILE_NAME') {
        return '缺少文件名，无法上传到 PicGo Cloud。'
      }
      if (key === 'PICGO_CLOUD_UPLOAD_MISSING_FILE_DATA') {
        return '缺少图片数据，无法上传到 PicGo Cloud。'
      }
      if (key === 'UPLOAD_FAILED') {
        return '上传失败'
      }
      if (key === 'CLOUD_ALBUM_AUTO_IMPORT_PENDING_WARNING') {
        return '自动导入未完全完成'
      }
      if (key === 'CLOUD_ALBUM_IMPORT_DUPLICATE_ID') {
        return '这些数据已经导入过 PicGo Cloud。'
      }
      return key
    })
  }
}

const createCtx = (token = 'token-123'): {
  ctx: IPicGo
  request: ReturnType<typeof vi.fn>
  getConfig: ReturnType<typeof vi.fn>
  removeConfig: ReturnType<typeof vi.fn>
  uploaderRegister: ReturnType<typeof vi.fn>
  afterFinishRegister: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
} => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'picgo-cloud-uploader-'))
  tempDirs.push(baseDir)
  const request = vi.fn()
  const getConfig = vi.fn((key?: string) => {
    if (key === 'settings.picgoCloud.token') {
      return token
    }
    if (key === 'picgoInternal.serverMode') {
      return undefined
    }
    return undefined
  })
  const removeConfig = vi.fn()
  const uploaderRegister = vi.fn()
  const afterFinishRegister = vi.fn()
  const on = vi.fn()
  const i18n = createI18n()
  const cloud = {
    getUserInfo: vi.fn(async () => null),
    album: {
      import: vi.fn(async () => ({
        total: 0,
        created: 0,
        skipped: 0,
        invalid: 0,
        failed: 0,
        pending: 0,
        items: []
      })),
      retryPending: vi.fn(async () => ({
        total: 0,
        created: 0,
        skipped: 0,
        invalid: 0,
        failed: 0,
        pending: 0,
        items: []
      })),
      addToPending: vi.fn(async () => [])
    }
  }

  const ctx = {
    request,
    baseDir,
    getConfig,
    removeConfig,
    cloud,
    on,
    emit: vi.fn(),
    off: vi.fn(),
    server: {
      isListening: vi.fn(() => false)
    },
    helper: {
      uploader: {
        register: uploaderRegister
      },
      afterFinishPlugins: {
        register: afterFinishRegister
      }
    },
    i18n,
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
      createLogger: vi.fn((options?: { logPath?: string }) => {
        return {
          info: (message: string) => {
            if (options?.logPath) {
              appendFileSync(options.logPath, `${message}\n`)
            }
          },
          success: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn()
        }
      })
    },
    output: [],
    input: []
  } as unknown as IPicGo

  return {
    ctx,
    request,
    getConfig,
    removeConfig,
    uploaderRegister,
    afterFinishRegister,
    on
  }
}

const getRegisteredUploader = (ctx: IPicGo, uploaderRegister: ReturnType<typeof vi.fn>): IRegisteredUploader => {
  registerPicGoCloudUploader(ctx)
  return uploaderRegister.mock.calls[0][1] as IRegisteredUploader
}

const waitForAutoImport = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve))
  await Promise.resolve()
  await new Promise((resolve) => setImmediate(resolve))
}

const waitForImportLog = async (ctx: IPicGo): Promise<void> => {
  const logPath = path.join(ctx.baseDir, PICGO_CLOUD_IMPORT_LOG_FILE)

  for (let attempt = 0; attempt < 20; attempt++) {
    if (existsSync(logPath) && statSync(logPath).size > 0) {
      return
    }
    await waitForAutoImport()
  }
}

const readImportLogEntries = (ctx: IPicGo): Array<Record<string, unknown>> => {
  const logPath = path.join(ctx.baseDir, PICGO_CLOUD_IMPORT_LOG_FILE)
  const content = readFileSync(logPath, 'utf8')
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const jsonStart = line.indexOf('{')
      return JSON.parse(jsonStart >= 0 ? line.slice(jsonStart) : line) as Record<string, unknown>
    })
}

describe('AuthRequestClient', () => {
  it('delegates to ctx.request with absolute cloud api url and auth header', async () => {
    const { ctx, request } = createCtx()
    request.mockResolvedValueOnce({ user: 'molunerfinn' })

    const client = new AuthRequestClient(ctx)
    const res = await client.request<{ user: string }>({
      method: 'GET',
      url: '/api/whoami'
    })

    expect(res).toEqual({ user: 'molunerfinn' })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://api.picgo.app/api/whoami',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123'
      })
    }))
  })
})

describe('picgoCloud uploader', () => {
  it('registers built-in uploader with fixed name and empty config schema', () => {
    const { ctx, uploaderRegister, afterFinishRegister, on } = createCtx()

    const uploader = getRegisteredUploader(ctx, uploaderRegister)

    expect(uploaderRegister).toHaveBeenCalledWith(PICGO_CLOUD, expect.objectContaining({
      name: 'PicGo Cloud'
    }))
    expect(afterFinishRegister).toHaveBeenCalledWith('picgoCloudAutoImport', expect.objectContaining({
      handle: expect.any(Function)
    }))
    expect(on).toHaveBeenCalledWith(IBuildInEvent.BEFORE_UPLOAD, expect.any(Function))
    expect(on).toHaveBeenCalledWith(IBuildInEvent.AFTER_UPLOAD, expect.any(Function))
    expect(uploader.config?.()).toEqual([])
  })

  it('uploads image via presign put complete flow', async () => {
    const { ctx, request, uploaderRegister, removeConfig } = createCtx()
    const uploader = getRegisteredUploader(ctx, uploaderRegister)
    const buffer = Buffer.from('image-data')

    ctx.output = [{
      fileName: 'demo.png',
      buffer,
      base64Image: 'aWdub3JlLW1l'
    }]

    request
      .mockResolvedValueOnce({
        success: true,
        objectKey: 'u/demo/2026/03/test.png',
        publicId: '550e8400-e29b-41d4-a716-446655440000',
        uploadUrl: 'https://upload.picgo.test/u/demo/2026/03/test.png',
        url: 'https://cdn.picgo.test/m/test.png',
        method: 'PUT',
        headers: {
          'X-Test': '1'
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        statusCode: 200,
        body: '',
        data: ''
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          item: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            imgUrl: 'https://cdn.picgo.test/m/test.png'
          }
        }
      })

    await uploader.handle(ctx)

    expect(request).toHaveBeenCalledTimes(3)
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'POST',
      url: 'https://api.picgo.app/api/upload/presign',
      data: {
        filename: 'demo.png',
        contentType: 'image/png'
      },
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123'
      })
    }))
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'PUT',
      url: 'https://upload.picgo.test/u/demo/2026/03/test.png',
      headers: {
        'X-Test': '1',
        'Content-Type': 'image/png'
      },
      data: buffer,
      resolveWithFullResponse: true
    }))
    expect(request).toHaveBeenNthCalledWith(3, expect.objectContaining({
      method: 'POST',
      url: 'https://api.picgo.app/api/album-items/complete',
      data: {
        objectKey: 'u/demo/2026/03/test.png',
        publicId: '550e8400-e29b-41d4-a716-446655440000',
        filename: 'demo.png'
      },
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123'
      })
    }))
    expect(ctx.output[0].imgUrl).toBe('https://cdn.picgo.test/m/test.png')
    expect(ctx.output[0].buffer).toBeUndefined()
    expect(ctx.output[0].base64Image).toBeUndefined()
    expect(removeConfig).not.toHaveBeenCalled()
  })

  it('fails with i18n message when token is missing', async () => {
    const { ctx, request, uploaderRegister } = createCtx('')
    const uploader = getRegisteredUploader(ctx, uploaderRegister)

    ctx.output = [{
      fileName: 'demo.png',
      buffer: Buffer.from('image-data')
    }]

    await expect(uploader.handle(ctx)).rejects.toThrow('请先登录 PicGo Cloud 后再使用该图床。')
    expect(request).not.toHaveBeenCalled()
  })

  it('clears token and asks for re-login when presign returns 401', async () => {
    const { ctx, request, uploaderRegister, removeConfig } = createCtx()
    const uploader = getRegisteredUploader(ctx, uploaderRegister)

    ctx.output = [{
      fileName: 'demo.png',
      buffer: Buffer.from('image-data')
    }]

    request.mockRejectedValueOnce({
      message: 'Unauthorized',
      statusCode: 401,
      response: {
        status: 401,
        body: {
          message: 'Unauthorized'
        }
      }
    })

    await expect(uploader.handle(ctx)).rejects.toThrow('PicGo Cloud 登录状态已失效，请重新登录后再试。')
    expect(removeConfig).toHaveBeenCalledWith('settings.picgoCloud', 'token')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps token and surfaces the backend error when complete returns 403', async () => {
    const { ctx, request, uploaderRegister, removeConfig } = createCtx()
    const uploader = getRegisteredUploader(ctx, uploaderRegister)

    ctx.output = [{
      fileName: 'demo.png',
      buffer: Buffer.from('image-data')
    }]

    request
      .mockResolvedValueOnce({
        success: true,
        objectKey: 'u/demo/2026/03/test.png',
        publicId: '550e8400-e29b-41d4-a716-446655440000',
        uploadUrl: 'https://upload.picgo.test/u/demo/2026/03/test.png',
        url: 'https://cdn.picgo.test/m/test.png',
        method: 'PUT',
        headers: {}
      })
      .mockResolvedValueOnce({
        status: 200,
        statusCode: 200,
        body: '',
        data: ''
      })
      .mockRejectedValueOnce({
        message: 'Forbidden',
        statusCode: 403,
        response: {
          status: 403,
          body: {
            message: 'Forbidden'
          }
        }
      })

    await expect(uploader.handle(ctx)).rejects.toThrow('Forbidden')
    expect(removeConfig).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('prefetches user info from the beforeUpload event when a token exists', async () => {
    const { ctx, uploaderRegister, on } = createCtx()
    getRegisteredUploader(ctx, uploaderRegister)

    const beforeUploadHandler = on.mock.calls.find(([eventName]) => eventName === IBuildInEvent.BEFORE_UPLOAD)?.[1] as ((ctx: IPicGo) => void) | undefined
    expect(beforeUploadHandler).toBeDefined()

    beforeUploadHandler?.(ctx)
    await new Promise((resolve) => setImmediate(resolve))

    expect(ctx.cloud.getUserInfo).toHaveBeenCalledTimes(1)
  })

  it('runs auto import in the background on afterUpload for long-lived runtimes', async () => {
    const { ctx, uploaderRegister, on } = createCtx()
    ctx.GUI_VERSION = '2.0.0'
    getRegisteredUploader(ctx, uploaderRegister)

    const afterUploadHandler = on.mock.calls.find(([eventName]) => eventName === IBuildInEvent.AFTER_UPLOAD)?.[1] as ((ctx: IPicGo) => void) | undefined
    expect(afterUploadHandler).toBeDefined()

    ctx.output = [{
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 1,
      autoImport: true
    })
    ;(ctx.cloud.album.import as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 1,
      created: 1,
      skipped: 0,
      invalid: 0,
      failed: 0,
      pending: 0,
      items: []
    })

    afterUploadHandler?.(ctx)
    await waitForImportLog(ctx)

    expect(ctx.cloud.album.import).toHaveBeenCalledWith(ctx.output)
    expect(ctx.output[0].id).toBeDefined()
    expect(ctx.cloud.album.retryPending).toHaveBeenCalledTimes(1)
    expect(ctx.cloud.album.addToPending).not.toHaveBeenCalled()
    expect(ctx.emit).toHaveBeenCalledWith(IBuildInEvent.CLOUD_ALBUM_UPDATED, expect.objectContaining({ items: expect.any(Array) }))
    expect(readImportLogEntries(ctx).at(-1)).toMatchObject({
      status: 'success',
      itemCount: 1,
      result: {
        created: 1
      }
    })
  })

  it('skips auto import for free users even when autoImport is true', async () => {
    const { ctx, uploaderRegister, on } = createCtx()
    ctx.GUI_VERSION = '2.0.0'
    getRegisteredUploader(ctx, uploaderRegister)

    const afterUploadHandler = on.mock.calls.find(([eventName]) => eventName === IBuildInEvent.AFTER_UPLOAD)?.[1] as ((ctx: IPicGo) => void) | undefined
    expect(afterUploadHandler).toBeDefined()

    ctx.output = [{
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 0,
      autoImport: true
    })

    afterUploadHandler?.(ctx)
    await waitForImportLog(ctx)

    expect(ctx.cloud.album.import).not.toHaveBeenCalled()
    expect(ctx.cloud.album.retryPending).not.toHaveBeenCalled()
    expect(ctx.cloud.album.addToPending).not.toHaveBeenCalled()
    expect(readImportLogEntries(ctx).at(-1)).toMatchObject({
      status: 'skipped',
      itemCount: 1,
      reason: 'plan_required'
    })
  })

  it('keeps the CLI fallback in afterFinishPlugins for one-shot runtimes', async () => {
    const { ctx, uploaderRegister, afterFinishRegister } = createCtx()
    getRegisteredUploader(ctx, uploaderRegister)

    const afterFinishPlugin = afterFinishRegister.mock.calls[0][1] as { handle: (ctx: IPicGo) => Promise<void> }
    ctx.output = [{
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 1,
      autoImport: true
    })
    ;(ctx.cloud.album.import as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 1,
      created: 1,
      skipped: 0,
      invalid: 0,
      failed: 0,
      pending: 0,
      items: []
    })

    await expect(afterFinishPlugin.handle(ctx)).resolves.toBeUndefined()

    expect(ctx.cloud.album.import).toHaveBeenCalledWith(ctx.output)
    expect(ctx.output[0].id).toBeDefined()
    expect(readImportLogEntries(ctx).at(-1)).toMatchObject({
      status: 'success',
      itemCount: 1
    })
  })

  it('adds uploaded items to pending when background auto import fails with a non-auth error', async () => {
    const { ctx, uploaderRegister, on } = createCtx()
    ctx.GUI_VERSION = '2.0.0'
    getRegisteredUploader(ctx, uploaderRegister)

    const afterUploadHandler = on.mock.calls.find(([eventName]) => eventName === IBuildInEvent.AFTER_UPLOAD)?.[1] as ((ctx: IPicGo) => void) | undefined
    expect(afterUploadHandler).toBeDefined()

    ctx.output = [{
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 1,
      autoImport: true
    })
    ;(ctx.cloud.album.import as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))

    afterUploadHandler?.(ctx)
    await waitForImportLog(ctx)

    expect(ctx.cloud.album.addToPending).toHaveBeenCalledWith(ctx.output)
    expect(ctx.log.warn).not.toHaveBeenCalled()
    expect(readImportLogEntries(ctx).at(-1)).toMatchObject({
      status: 'failed',
      itemCount: 1,
      error: {
        message: 'network error'
      }
    })
  })

  it('does not add uploaded items to pending when auto import fails with 403', async () => {
    const { ctx, uploaderRegister, on } = createCtx()
    ctx.GUI_VERSION = '2.0.0'
    getRegisteredUploader(ctx, uploaderRegister)

    const afterUploadHandler = on.mock.calls.find(([eventName]) => eventName === IBuildInEvent.AFTER_UPLOAD)?.[1] as ((ctx: IPicGo) => void) | undefined
    expect(afterUploadHandler).toBeDefined()

    ctx.output = [{
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 1,
      autoImport: true
    })
    ;(ctx.cloud.album.import as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true,
      message: 'forbidden',
      response: {
        status: 403,
        data: {
          message: 'forbidden'
        }
      }
    })

    afterUploadHandler?.(ctx)
    await waitForImportLog(ctx)

    expect(ctx.cloud.album.addToPending).not.toHaveBeenCalled()
    expect(ctx.log.warn).not.toHaveBeenCalled()
    expect(readImportLogEntries(ctx).at(-1)).toMatchObject({
      status: 'failed',
      error: {
        message: 'forbidden',
        status: 403
      }
    })
  })

  it('does not add uploaded items to pending when auto import fails with duplicate id', async () => {
    const { ctx, uploaderRegister, on } = createCtx()
    ctx.GUI_VERSION = '2.0.0'
    getRegisteredUploader(ctx, uploaderRegister)

    const afterUploadHandler = on.mock.calls.find(([eventName]) => eventName === IBuildInEvent.AFTER_UPLOAD)?.[1] as ((ctx: IPicGo) => void) | undefined
    expect(afterUploadHandler).toBeDefined()

    ctx.output = [{
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 1,
      autoImport: true
    })
    ;(ctx.cloud.album.import as ReturnType<typeof vi.fn>).mockRejectedValue({
      apiCode: 'DUPLICATE_ID',
      status: 409,
      message: '这些数据已经导入过 PicGo Cloud。'
    })

    afterUploadHandler?.(ctx)
    await waitForImportLog(ctx)

    expect(ctx.cloud.album.addToPending).not.toHaveBeenCalled()
    expect(ctx.log.warn).not.toHaveBeenCalled()
    expect(readImportLogEntries(ctx).at(-1)).toMatchObject({
      status: 'failed',
      error: {
        message: '这些数据已经导入过 PicGo Cloud。',
        code: 'DUPLICATE_ID'
      }
    })
  })

  it('does not import items uploaded by picgoCloud itself', async () => {
    const { ctx, uploaderRegister, afterFinishRegister } = createCtx()
    getRegisteredUploader(ctx, uploaderRegister)

    const afterFinishPlugin = afterFinishRegister.mock.calls[0][1] as { handle: (ctx: IPicGo) => Promise<void> }
    ctx.output = [{
      type: PICGO_CLOUD,
      imgUrl: 'https://img.example.com/1.png'
    }]
    ;(ctx.cloud.getUserInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: 'molunerfinn',
      plan: 1,
      autoImport: true
    })

    await expect(afterFinishPlugin.handle(ctx)).resolves.toBeUndefined()

    expect(ctx.cloud.album.import).not.toHaveBeenCalled()
    expect(ctx.cloud.album.retryPending).not.toHaveBeenCalled()
  })
})
