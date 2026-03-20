import { describe, expect, it, vi } from 'vitest'
import type { IPicGo } from '../../types'
import { AuthRequestClient } from '../../lib/Cloud/Request'
import { registerPicGoCloudUploader } from '../../plugins/uploader/picgoCloud'

type II18nMock = {
  translate: ReturnType<typeof vi.fn>
}

type IRegisteredUploader = {
  name: string
  handle: (ctx: IPicGo) => Promise<IPicGo>
  config?: () => unknown[]
}

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
} => {
  const request = vi.fn()
  const getConfig = vi.fn((key?: string) => {
    if (key === 'settings.picgoCloud.token') {
      return token
    }
    return undefined
  })
  const removeConfig = vi.fn()
  const uploaderRegister = vi.fn()
  const i18n = createI18n()

  const ctx = {
    request,
    getConfig,
    removeConfig,
    helper: {
      uploader: {
        register: uploaderRegister
      }
    },
    i18n,
    log: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn()
    },
    output: [],
    input: []
  } as unknown as IPicGo

  return {
    ctx,
    request,
    getConfig,
    removeConfig,
    uploaderRegister
  }
}

const getRegisteredUploader = (ctx: IPicGo, uploaderRegister: ReturnType<typeof vi.fn>): IRegisteredUploader => {
  registerPicGoCloudUploader(ctx)
  return uploaderRegister.mock.calls[0][1] as IRegisteredUploader
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
    const { ctx, uploaderRegister } = createCtx()

    const uploader = getRegisteredUploader(ctx, uploaderRegister)

    expect(uploaderRegister).toHaveBeenCalledWith('picgoCloud', expect.objectContaining({
      name: 'PicGo Cloud'
    }))
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
        result: ['https://cdn.picgo.test/m/test.png']
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
      url: 'https://api.picgo.app/api/upload/complete',
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

  it('clears token and asks for re-login when complete returns 403', async () => {
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

    await expect(uploader.handle(ctx)).rejects.toThrow('PicGo Cloud 登录状态已失效，请重新登录后再试。')
    expect(removeConfig).toHaveBeenCalledWith('settings.picgoCloud', 'token')
    expect(request).toHaveBeenCalledTimes(3)
  })
})
