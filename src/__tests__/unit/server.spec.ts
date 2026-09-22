import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { get, set } from 'lodash'
import { ServerManager } from '../../lib/Server'
import { EN } from '../../i18n/en'
import type { II18nManager, IPicGo, IImgInfo, IUploaderConfigItem, UploadOptions } from '../../types'
import type { IServerUploadAdapter } from '../../types/internal'
import { UploadOptionError, UploadOptionErrorCode } from '../../lib/UploadOption'

type ILogSpy = {
  warn: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  debug: ReturnType<typeof vi.fn>
}

const createTempDir = async (prefix: string): Promise<string> => {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

const formatI18n = (template: string, args?: Record<string, string>): string => {
  if (!args) return template
  return Object.entries(args).reduce((result, [key, value]) => {
    return result.replaceAll(`\${${key}}`, value)
  }, template)
}

const createMockI18n = (): II18nManager => {
  return {
    translate: <T extends string>(key: T, args?: Record<string, string>) => {
      const template = EN[key as keyof typeof EN] ?? String(key)
      return formatI18n(template, args)
    },
    addLocale: () => false,
    setLanguage: () => {},
    addLanguage: () => false,
    getLanguageList: () => []
  }
}

const originalEnvSecret = process.env.PICGO_SERVER_SECRET

const createUploaderProfile = (id: string, name: string): IUploaderConfigItem => ({
  _id: id,
  _configName: name,
  _createdAt: 1,
  _updatedAt: 1
})

const createMockCtx = async (
  initialConfig: Record<string, unknown>,
  uploadMock: (input?: any[], options?: UploadOptions) => Promise<IImgInfo[] | Error>
): Promise<{
  ctx: IPicGo
  log: ILogSpy
  baseDir: string
  getConfigMock: ReturnType<typeof vi.fn>
  saveConfigMock: ReturnType<typeof vi.fn>
}> => {
  const config: Record<string, unknown> = structuredClone(initialConfig)
  const baseDir = await createTempDir('picgo-core-server-')
  const i18n = createMockI18n()

  const log: ILogSpy = {
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }

  const getConfigMock = vi.fn(<T>(name?: string): T => {
    if (!name) return config as unknown as T
    return get(config, name) as T
  })

  const saveConfigMock = vi.fn((patch: Record<string, unknown>) => {
    for (const key of Object.keys(patch)) {
      set(config, key, patch[key])
    }
  })

  const listUploaderTypes = (): string[] => {
    const uploaderConfig = get(config, 'uploader')
    if (typeof uploaderConfig !== 'object' || uploaderConfig === null || Array.isArray(uploaderConfig)) return []
    return Object.keys(uploaderConfig)
  }

  const getConfigList = (type: string): IUploaderConfigItem[] => {
    const configList = get(config, `uploader.${type}.configList`)
    return Array.isArray(configList) ? configList as IUploaderConfigItem[] : []
  }

  const getActiveConfig = (type: string): IUploaderConfigItem | undefined => {
    const configList = getConfigList(type)
    const defaultId = get(config, `uploader.${type}.defaultId`)
    return configList.find(item => item._id === defaultId) ?? configList[0]
  }

  const ctx = {
    baseDir,
    log,
    getConfig: getConfigMock,
    saveConfig: saveConfigMock,
    i18n,
    uploaderConfig: {
      listUploaderTypes,
      getConfigList,
      getActiveConfig
    },
    upload: uploadMock
  } as unknown as IPicGo

  return { ctx, log, baseDir, getConfigMock, saveConfigMock }
}

const toJson = async (res: Response): Promise<any> => {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

describe('ServerManager (local server)', () => {
  beforeEach(() => {
    process.env.PICGO_SERVER_SECRET = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.PICGO_SERVER_SECRET = originalEnvSecret
  })

  it('listens idempotently and exposes /heartbeat', async () => {
    const uploadMock = vi.fn(async () => [{ imgUrl: 'https://a.example/1.png' }])
    const { ctx, getConfigMock, baseDir } = await createMockCtx({
      settings: {
        server: {
          port: 0,
          host: '127.0.0.1'
        }
      }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(undefined, undefined, true)
    expect(typeof port).toBe('number')
    expect(port).toBeGreaterThan(0)
    expect(getConfigMock).toHaveBeenCalledWith('settings.server.port')
    expect(getConfigMock).toHaveBeenCalledWith('settings.server.host')

    const baseUrl = `http://127.0.0.1:${port as number}`
    const res = await fetch(`${baseUrl}/heartbeat`, { method: 'POST' })
    expect(res.status).toBe(200)
    await expect(toJson(res)).resolves.toEqual({ success: true, result: 'alive' })

    const port2 = await server.listen(undefined, undefined, true)
    expect(port2).toBe(port)

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('treats empty body, {} and {list: []} as clipboard upload; invalid JSON is 400', async () => {
    const uploadMock = vi.fn(async (input?: any[]) => {
      if (!input) {
        return [{ imgUrl: 'https://a.example/clipboard.png' }]
      }
      return input.map((p) => ({ imgUrl: `https://a.example/${encodeURIComponent(String(p))}` }))
    })

    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true)
    expect(typeof port).toBe('number')

    const baseUrl = `http://127.0.0.1:${port as number}`

    const resEmpty = await fetch(`${baseUrl}/upload`, { method: 'POST' })
    expect(resEmpty.status).toBe(200)
    expect(await toJson(resEmpty)).toEqual({ success: true, result: ['https://a.example/clipboard.png'], items: [{ imgUrl: 'https://a.example/clipboard.png' }] })

    const resObj = await fetch(`${baseUrl}/upload`, { method: 'POST', body: '{}' })
    expect(resObj.status).toBe(200)
    expect(await toJson(resObj)).toEqual({ success: true, result: ['https://a.example/clipboard.png'], items: [{ imgUrl: 'https://a.example/clipboard.png' }] })

    const resEmptyList = await fetch(`${baseUrl}/upload`, { method: 'POST', body: JSON.stringify({ list: [] }) })
    expect(resEmptyList.status).toBe(200)
    expect(await toJson(resEmptyList)).toEqual({ success: true, result: ['https://a.example/clipboard.png'], items: [{ imgUrl: 'https://a.example/clipboard.png' }] })

    const resList = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      body: JSON.stringify({ list: ['/a.png', '/b.png'] })
    })
    expect(resList.status).toBe(200)
    expect(await toJson(resList)).toEqual({
      success: true,
      result: [
        'https://a.example/%2Fa.png',
        'https://a.example/%2Fb.png'
      ],
      items: [
        { imgUrl: 'https://a.example/%2Fa.png' },
        { imgUrl: 'https://a.example/%2Fb.png' }
      ]
    })

    const resInvalidJson = await fetch(`${baseUrl}/upload`, { method: 'POST', body: '{' })
    expect(resInvalidJson.status).toBe(400)
    expect(await toJson(resInvalidJson)).toMatchObject({ success: false })

    // upload() called: empty, {}, {list:[]}, list
    expect(uploadMock).toHaveBeenCalledTimes(4)
    expect(uploadMock).toHaveBeenNthCalledWith(1)
    expect(uploadMock).toHaveBeenNthCalledWith(2)
    expect(uploadMock).toHaveBeenNthCalledWith(3)
    expect(uploadMock).toHaveBeenNthCalledWith(4, ['/a.png', '/b.png'])

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('removes multipart temp files after completion', async () => {
    const uploadedFiles: string[] = []
    const uploadMock = vi.fn(async (input?: any[]) => {
      const list = Array.isArray(input) ? input : []
      uploadedFiles.push(...list.map(String))
      for (const filePath of list) {
        expect(await fs.pathExists(String(filePath))).toBe(true)
      }
      return [{ imgUrl: 'https://a.example/form.png' }]
    })

    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true)
    expect(typeof port).toBe('number')

    const fd = new FormData()
    fd.append('files', new Blob([Buffer.from('hello')], { type: 'image/png' }), 'a.png')

    const res = await fetch(`http://127.0.0.1:${port as number}/upload`, { method: 'POST', body: fd })
    expect(res.status).toBe(200)
    expect(await toJson(res)).toEqual({ success: true, result: ['https://a.example/form.png'], items: [{ imgUrl: 'https://a.example/form.png' }] })

    expect(uploadedFiles.length).toBeGreaterThan(0)
    for (const filePath of uploadedFiles) {
      expect(await fs.pathExists(filePath)).toBe(false)
    }

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('keeps duplicate multipart filenames distinct within one request and cleans the request directory', async () => {
    const adapterTempDir = await createTempDir('picgo-core-same-request-')
    const uploadedPaths: string[] = []
    const uploadedContents: string[] = []
    let requestTempDir = ''
    const uploadPathsMock = vi.fn(async (paths: string[]) => {
      uploadedPaths.push(...paths)
      requestTempDir = path.dirname(path.dirname(paths[0]))
      for (const filePath of paths) {
        uploadedContents.push((await fs.readFile(filePath)).toString())
      }
      return paths.map((filePath, index) => ({
        origin: filePath,
        imgUrl: `https://a.example/${index}.png`
      }))
    })
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }]))

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: async () => [{ imgUrl: 'https://a.example/unexpected.png' }],
      uploadPaths: uploadPathsMock,
      getTempDir: () => adapterTempDir
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const formData = new FormData()
    formData.append('files', new Blob([Buffer.from('first')]), 'same.png')
    formData.append('files', new Blob([Buffer.from('second')]), 'same.png')

    const response = await fetch(`http://127.0.0.1:${port as number}/upload`, { method: 'POST', body: formData })
    expect(response.status).toBe(200)
    expect(uploadedPaths).toHaveLength(2)
    expect(uploadedPaths[0]).not.toBe(uploadedPaths[1])
    expect(uploadedPaths.map(filePath => path.basename(filePath))).toEqual(['same.png', 'same.png'])
    expect(uploadedContents).toEqual(['first', 'second'])
    expect(requestTempDir.startsWith(adapterTempDir)).toBe(true)
    expect(await fs.pathExists(requestTempDir)).toBe(false)

    server.shutdown()
    await fs.remove(baseDir)
    await fs.remove(adapterTempDir)
  })

  it('isolates identical multipart filenames across concurrent requests', async () => {
    const adapterTempDir = await createTempDir('picgo-core-concurrent-requests-')
    let firstEnteredResolve: (() => void) | undefined
    let secondEnteredResolve: (() => void) | undefined
    let releaseSecondResolve: (() => void) | undefined
    const firstEntered = new Promise<void>((resolve) => { firstEnteredResolve = resolve })
    const secondEntered = new Promise<void>((resolve) => { secondEnteredResolve = resolve })
    const releaseSecond = new Promise<void>((resolve) => { releaseSecondResolve = resolve })
    const pathsByContent = new Map<string, string>()
    const uploadPathsMock = vi.fn(async (paths: string[]) => {
      const filePath = paths[0]
      const content = (await fs.readFile(filePath)).toString()
      pathsByContent.set(content, filePath)
      if (content === 'first-request') {
        firstEnteredResolve?.()
        await secondEntered
      } else {
        secondEnteredResolve?.()
        await releaseSecond
      }
      expect((await fs.readFile(filePath)).toString()).toBe(content)
      return [{ imgUrl: `https://a.example/${content}.png` }]
    })
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }]))

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: async () => [{ imgUrl: 'https://a.example/unexpected.png' }],
      uploadPaths: uploadPathsMock,
      getTempDir: () => adapterTempDir
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const url = `http://127.0.0.1:${port as number}/upload`
    const firstForm = new FormData()
    firstForm.append('files', new Blob([Buffer.from('first-request')]), 'same.png')
    const firstRequest = fetch(url, { method: 'POST', body: firstForm })
    await firstEntered

    const secondForm = new FormData()
    secondForm.append('files', new Blob([Buffer.from('second-request')]), 'same.png')
    const secondRequest = fetch(url, { method: 'POST', body: secondForm })
    await secondEntered

    const firstResponse = await firstRequest
    expect(firstResponse.status).toBe(200)
    const firstPath = pathsByContent.get('first-request')
    const secondPath = pathsByContent.get('second-request')
    expect(firstPath).toBeDefined()
    expect(secondPath).toBeDefined()
    expect(firstPath).not.toBe(secondPath)
    expect(path.dirname(path.dirname(firstPath as string))).not.toBe(path.dirname(path.dirname(secondPath as string)))
    expect(await fs.pathExists(firstPath as string)).toBe(false)
    expect((await fs.readFile(secondPath as string)).toString()).toBe('second-request')

    releaseSecondResolve?.()
    const secondResponse = await secondRequest
    expect(secondResponse.status).toBe(200)
    expect(await fs.pathExists(secondPath as string)).toBe(false)

    server.shutdown()
    await fs.remove(baseDir)
    await fs.remove(adapterTempDir)
  })

  it('cleans the multipart request directory when upload execution fails', async () => {
    const adapterTempDir = await createTempDir('picgo-core-failed-request-')
    let requestTempDir = ''
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }]))

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: async () => [{ imgUrl: 'https://a.example/unexpected.png' }],
      uploadPaths: async (paths: string[]) => {
        requestTempDir = path.dirname(path.dirname(paths[0]))
        throw new Error('multipart upload failed')
      },
      getTempDir: () => adapterTempDir
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const formData = new FormData()
    formData.append('files', new Blob([Buffer.from('failure')]), 'same.png')

    const response = await fetch(`http://127.0.0.1:${port as number}/upload`, { method: 'POST', body: formData })
    expect(response.status).toBe(500)
    expect(requestTempDir.startsWith(adapterTempDir)).toBe(true)
    expect(await fs.pathExists(requestTempDir)).toBe(false)

    server.shutdown()
    await fs.remove(baseDir)
    await fs.remove(adapterTempDir)
  })

  it('uses internal upload adapter while keeping core response shape and cleanup', async () => {
    const adapterTempDir = await createTempDir('picgo-core-adapter-form-')
    const uploadedTempFiles: string[] = []
    const uploadMock = vi.fn(async () => {
      throw new Error('ctx.upload should not be called when adapter is set')
    })
    const uploadClipboardMock = vi.fn(async () => [{
      imgUrl: 'https://a.example/clipboard.png',
      origin: 'clipboard',
      fileName: 'clipboard.png',
      extname: '.png',
      size: 123
    }])
    const uploadPathsMock = vi.fn(async (paths: string[]) => {
      for (const item of paths) {
        if (item.startsWith(adapterTempDir)) {
          uploadedTempFiles.push(item)
          expect(await fs.pathExists(item)).toBe(true)
        }
      }
      return paths.map((item, index) => ({
        origin: item,
        imgUrl: `https://a.example/${index}.png`,
        fileName: path.basename(item),
        extname: '.png',
        size: 456 + index
      }))
    })
    const uploadAdapter: IServerUploadAdapter = {
      uploadClipboard: uploadClipboardMock,
      uploadPaths: uploadPathsMock,
      getTempDir: () => adapterTempDir
    }

    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    server.setUploadAdapter(uploadAdapter)
    const port = await server.listen(0, '127.0.0.1', true)
    expect(typeof port).toBe('number')

    const baseUrl = `http://127.0.0.1:${port as number}`

    const resClipboard = await fetch(`${baseUrl}/upload`, { method: 'POST' })
    expect(resClipboard.status).toBe(200)
    expect(await toJson(resClipboard)).toEqual({
      success: true,
      result: ['https://a.example/clipboard.png'],
      items: [{
        imgUrl: 'https://a.example/clipboard.png',
        origin: 'clipboard',
        fileName: 'clipboard.png',
        extname: '.png',
        size: 123
      }]
    })

    const resList = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      body: JSON.stringify({ list: ['/input.png'] })
    })
    expect(resList.status).toBe(200)
    expect(await toJson(resList)).toEqual({
      success: true,
      result: ['https://a.example/0.png'],
      items: [{
        imgUrl: 'https://a.example/0.png',
        origin: '/input.png',
        fileName: 'input.png',
        extname: '.png',
        size: 456
      }]
    })

    const fd = new FormData()
    fd.append('files', new Blob([Buffer.from('hello')], { type: 'image/png' }), 'form.png')
    const resForm = await fetch(`${baseUrl}/upload`, { method: 'POST', body: fd })
    expect(resForm.status).toBe(200)
    const formJson = await toJson(resForm)
    expect(formJson.success).toBe(true)
    expect(formJson.result).toEqual(['https://a.example/0.png'])
    expect(formJson.items[0]).toEqual(expect.objectContaining({
      imgUrl: 'https://a.example/0.png',
      fileName: 'form.png',
      extname: '.png'
    }))

    expect(uploadClipboardMock).toHaveBeenCalledTimes(1)
    expect(uploadClipboardMock).toHaveBeenCalledWith()
    expect(uploadPathsMock).toHaveBeenCalledTimes(2)
    expect(uploadPathsMock).toHaveBeenNthCalledWith(1, ['/input.png'])
    expect(uploadedTempFiles.length).toBeGreaterThan(0)
    for (const filePath of uploadedTempFiles) {
      expect(filePath.startsWith(adapterTempDir)).toBe(true)
      expect(await fs.pathExists(filePath)).toBe(false)
    }
    expect(uploadMock).not.toHaveBeenCalled()

    server.shutdown()
    await fs.remove(baseDir)
    await fs.remove(adapterTempDir)
  })

  it('forwards validated upload option to every request body mode', async () => {
    const options: UploadOptions = { uploader: 's3', configName: 'Primary' }
    const uploadMock = vi.fn(async () => {
      throw new Error('ctx.upload should not be called when adapter is set')
    })
    const uploadClipboardMock = vi.fn(async (_options?: UploadOptions) => [{ imgUrl: 'https://a.example/clipboard.png' }])
    const uploadPathsMock = vi.fn(async (paths: string[], _options?: UploadOptions) => paths.map((item, index) => ({
      origin: item,
      imgUrl: `https://a.example/${index}.png`
    })))
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } },
      uploader: {
        s3: {
          configList: [createUploaderProfile('s3-primary', 'Primary')],
          defaultId: 's3-primary'
        }
      }
    }, uploadMock)

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: uploadClipboardMock,
      uploadPaths: uploadPathsMock
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const url = `http://127.0.0.1:${port as number}/upload?uploader=s3&configName=Primary`

    const emptyResponse = await fetch(url, { method: 'POST' })
    expect(emptyResponse.status).toBe(200)

    const jsonClipboardResponse = await fetch(url, { method: 'POST', body: '{}' })
    expect(jsonClipboardResponse.status).toBe(200)

    const listResponse = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ list: ['/selected.png'] })
    })
    expect(listResponse.status).toBe(200)

    const formData = new FormData()
    formData.append('files', new Blob([Buffer.from('selected')], { type: 'image/png' }), 'selected.png')
    const multipartResponse = await fetch(url, { method: 'POST', body: formData })
    expect(multipartResponse.status).toBe(200)

    expect(uploadClipboardMock).toHaveBeenCalledTimes(2)
    expect(uploadClipboardMock).toHaveBeenNthCalledWith(1, options)
    expect(uploadClipboardMock).toHaveBeenNthCalledWith(2, options)
    expect(uploadPathsMock).toHaveBeenCalledTimes(2)
    expect(uploadPathsMock).toHaveBeenNthCalledWith(1, ['/selected.png'], options)
    expect(uploadPathsMock.mock.calls[1]?.[1]).toEqual(options)
    expect(uploadMock).not.toHaveBeenCalled()

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('forwards option through the default adapter to PicGo upload', async () => {
    const uploadMock = vi.fn(async (input?: any[]) => {
      return [{ imgUrl: input === undefined ? 'https://a.example/clipboard.png' : 'https://a.example/path.png' }]
    })
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } },
      uploader: {
        s3: {
          configList: [createUploaderProfile('s3-primary', 'Primary')],
          defaultId: 's3-primary'
        }
      }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true)
    const url = `http://127.0.0.1:${port as number}/upload?uploader=s3&configName=Primary`
    const options: UploadOptions = { uploader: 's3', configName: 'Primary' }

    const clipboardResponse = await fetch(url, { method: 'POST' })
    expect(clipboardResponse.status).toBe(200)
    const listResponse = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ list: ['/selected.png'] })
    })
    expect(listResponse.status).toBe(200)
    expect(uploadMock).toHaveBeenNthCalledWith(1, undefined, options)
    expect(uploadMock).toHaveBeenNthCalledWith(2, ['/selected.png'], options)

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('returns structured option errors before adapter or multipart temp operations', async () => {
    const adapterTempDir = await createTempDir('picgo-core-option-prevalidation-')
    const getTempDirMock = vi.fn(() => adapterTempDir)
    const uploadClipboardMock = vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }])
    const uploadPathsMock = vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }])
    const uploadMock = vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }])
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } },
      uploader: {
        s3: {
          configList: [createUploaderProfile('s3-primary', 'Primary')],
          defaultId: 's3-primary'
        },
        oss: {
          configList: [createUploaderProfile('oss-shared', 'Shared')],
          defaultId: 'oss-shared'
        },
        cos: {
          configList: [createUploaderProfile('cos-shared', 'Shared')],
          defaultId: 'cos-shared'
        }
      }
    }, uploadMock)

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: uploadClipboardMock,
      uploadPaths: uploadPathsMock,
      getTempDir: getTempDirMock
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const baseUrl = `http://127.0.0.1:${port as number}/upload`

    const invalidForm = new FormData()
    invalidForm.append('files', new Blob([Buffer.from('must-not-write')]), 'same.png')
    const cases = [
      { query: 'uploader=', code: UploadOptionErrorCode.InvalidOption, body: invalidForm },
      { query: 'configName=one&configName=two', code: UploadOptionErrorCode.InvalidOption },
      { query: 'uploader=unknown', code: UploadOptionErrorCode.UnknownUploader },
      { query: 'uploader=s3&configName=Missing', code: UploadOptionErrorCode.ConfigNotFound },
      { query: 'configName=Shared', code: UploadOptionErrorCode.AmbiguousConfig }
    ]

    for (const testCase of cases) {
      const response = await fetch(`${baseUrl}?${testCase.query}`, {
        method: 'POST',
        body: testCase.body
      })
      expect(response.status).toBe(400)
      const json = await toJson(response)
      expect(json).toMatchObject({
        success: false,
        result: [],
        items: [],
        code: testCase.code,
        message: expect.any(String)
      })
      expect(json.message).not.toMatch(/^UPLOAD_OPTION_/)
    }

    expect(getTempDirMock).not.toHaveBeenCalled()
    expect(uploadClipboardMock).not.toHaveBeenCalled()
    expect(uploadPathsMock).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
    expect(await fs.readdir(adapterTempDir)).toEqual([])

    server.shutdown()
    await fs.remove(baseDir)
    await fs.remove(adapterTempDir)
  })

  it('accepts resolver ID fallback to name and forwards both selectors', async () => {
    const uploadPathsMock = vi.fn(async () => [{ imgUrl: 'https://a.example/fallback.png' }])
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } },
      uploader: {
        s3: {
          configList: [createUploaderProfile('s3-secondary', 'Secondary')],
          defaultId: 's3-secondary'
        }
      }
    }, vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }]))

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: async () => [{ imgUrl: 'https://a.example/unexpected.png' }],
      uploadPaths: uploadPathsMock
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const response = await fetch(`http://127.0.0.1:${port as number}/upload?uploader=s3&configId=missing-id&configName=Secondary`, {
      method: 'POST',
      body: JSON.stringify({ list: ['/fallback.png'] })
    })

    expect(response.status).toBe(200)
    expect(uploadPathsMock).toHaveBeenCalledWith(['/fallback.png'], {
      uploader: 's3',
      configId: 'missing-id',
      configName: 'Secondary'
    })

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('preserves structured option errors returned or thrown by adapters', async () => {
    const returnedError = new UploadOptionError(UploadOptionErrorCode.ConfigNotFound, 'returned option failure')
    const thrownError = new UploadOptionError(UploadOptionErrorCode.AmbiguousConfig, 'thrown option failure')
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } },
      uploader: {
        s3: {
          configList: [createUploaderProfile('s3-primary', 'Primary')],
          defaultId: 's3-primary'
        }
      }
    }, vi.fn(async () => [{ imgUrl: 'https://a.example/unexpected.png' }]))

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: async () => returnedError,
      uploadPaths: async () => {
        throw thrownError
      }
    })
    const port = await server.listen(0, '127.0.0.1', true)
    const baseUrl = `http://127.0.0.1:${port as number}/upload?uploader=s3`

    const returnedResponse = await fetch(baseUrl, { method: 'POST' })
    expect(returnedResponse.status).toBe(400)
    expect(await toJson(returnedResponse)).toEqual({
      success: false,
      result: [],
      items: [],
      code: UploadOptionErrorCode.ConfigNotFound,
      message: returnedError.message
    })

    const thrownResponse = await fetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ list: ['/a.png'] })
    })
    expect(thrownResponse.status).toBe(400)
    expect(await toJson(thrownResponse)).toEqual({
      success: false,
      result: [],
      items: [],
      code: UploadOptionErrorCode.AmbiguousConfig,
      message: thrownError.message
    })

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('rejects non-internal builtin route overrides while upload adapter remains available', async () => {
    const uploadMock = vi.fn(async () => [{ imgUrl: 'https://a.example/core.png' }])
    const uploadClipboardMock = vi.fn(async () => [{ imgUrl: 'https://a.example/adapter.png' }])
    const { ctx, baseDir, log } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    server.setUploadAdapter({
      uploadClipboard: uploadClipboardMock,
      uploadPaths: async () => []
    })
    server.registerPost('/upload', (c) => c.json({ success: true, result: ['plugin-overridden'] }))

    const port = await server.listen(0, '127.0.0.1', true)
    expect(typeof port).toBe('number')

    const res = await fetch(`http://127.0.0.1:${port as number}/upload`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await toJson(res)).toEqual({
      success: true,
      result: ['https://a.example/adapter.png'],
      items: [{ imgUrl: 'https://a.example/adapter.png' }]
    })
    expect(uploadClipboardMock).toHaveBeenCalledTimes(1)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith('[PicGo Server] Plugin attempted to overwrite builtin route: /upload. Action denied.')

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('enforces authentication for upload and plugin routes with strict priority', async () => {
    process.env.PICGO_SERVER_SECRET = 'env-secret'
    const uploadMock = vi.fn(async () => [{ imgUrl: 'https://a.example/secure.png' }])
    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1', secret: 'config-secret' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    server.registerGet('/plugin/ping', (c) => c.text('ok'))
    const port = await server.listen(0, '127.0.0.1', true, 'cli-secret')
    expect(typeof port).toBe('number')

    const baseUrl = `http://127.0.0.1:${port as number}`

    const heartbeat = await fetch(`${baseUrl}/heartbeat`, { method: 'POST' })
    expect(heartbeat.status).toBe(200)

    const invalidOptionWithoutAuth = await fetch(`${baseUrl}/upload?uploader=`, { method: 'POST' })
    expect(invalidOptionWithoutAuth.status).toBe(401)
    expect(uploadMock).not.toHaveBeenCalled()

    const resNoFallback = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong',
        'X-PicGo-Secret': 'cli-secret'
      }
    })
    expect(resNoFallback.status).toBe(401)

    const resEnv = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer env-secret' }
    })
    expect(resEnv.status).toBe(401)

    const resAuth = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { Authorization: 'bearer cli-secret' }
    })
    expect(resAuth.status).toBe(200)

    const resPlugin = await fetch(`${baseUrl}/plugin/ping`)
    expect(resPlugin.status).toBe(401)

    const resPluginAuth = await fetch(`${baseUrl}/plugin/ping`, {
      headers: { 'X-PicGo-Secret': 'cli-secret' }
    })
    expect(resPluginAuth.status).toBe(200)

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('logs unauthorized requests with forwarded ip', async () => {
    const uploadMock = vi.fn(async () => [{ imgUrl: 'https://a.example/secure.png' }])
    const { ctx, baseDir, log } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true, 'secret')
    expect(typeof port).toBe('number')

    const baseUrl = `http://127.0.0.1:${port as number}`
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': '10.0.0.1, 10.0.0.2' }
    })
    expect(res.status).toBe(401)

    const expected = EN.SERVER_AUTH_UNAUTHORIZED_REQUEST.replace('${ip}', '10.0.0.1')
    expect(log.warn).toHaveBeenCalledWith(expected)

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('warns once when query secret is used', async () => {
    const uploadMock = vi.fn(async () => [{ imgUrl: 'https://a.example/secure.png' }])
    const { ctx, baseDir, log } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true, 'secret')
    expect(typeof port).toBe('number')

    const baseUrl = `http://127.0.0.1:${port as number}`
    const res1 = await fetch(`${baseUrl}/upload?secret=secret`, { method: 'POST' })
    expect(res1.status).toBe(200)

    const res2 = await fetch(`${baseUrl}/upload?secret=secret`, { method: 'POST' })
    expect(res2.status).toBe(200)

    const warningCalls = log.warn.mock.calls
      .map(call => call[0])
      .filter(message => message === EN.SERVER_AUTH_QUERY_SECRET_WARNING)
    expect(warningCalls).toHaveLength(1)

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('reuses port when existing PicGo server is detected, otherwise increments', async () => {
    const uploadMock1 = vi.fn(async () => [{ imgUrl: 'https://a.example/1.png' }])
    const { ctx: ctx1, baseDir: baseDir1 } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock1)

    const server1 = new ServerManager(ctx1)
    const port1 = await server1.listen(0, '127.0.0.1', true)
    expect(typeof port1).toBe('number')

    const uploadMock2 = vi.fn(async () => [{ imgUrl: 'https://a.example/2.png' }])
    const { ctx: ctx2, baseDir: baseDir2 } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock2)

    const server2 = new ServerManager(ctx2)
    const reused = await server2.listen(port1 as number, '127.0.0.1')
    expect(reused).toBe(port1)
    expect(server2.isListening()).toBe(false)

    // Stop the existing PicGo server before testing "increment" behavior to avoid
    // accidentally reusing another PicGo instance on portToTry + 1.
    server1.shutdown()

    const dummy = http.createServer((_req, res) => {
      res.statusCode = 404
      res.end('nope')
    })
    await new Promise<void>((resolve) => {
      dummy.listen(0, '127.0.0.1', () => resolve())
    })
    const dummyPort = (dummy.address() as AddressInfo).port

    const uploadMock3 = vi.fn(async () => [{ imgUrl: 'https://a.example/3.png' }])
    const { ctx: ctx3, baseDir: baseDir3 } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock3)

    const server3 = new ServerManager(ctx3)
    const moved = await server3.listen(dummyPort, '127.0.0.1')
    expect(typeof moved).toBe('number')
    expect(moved).not.toBe(dummyPort)
    expect(server3.isListening()).toBe(true)

    server3.shutdown()
    dummy.close()
    server2.shutdown()

    await fs.remove(baseDir1)
    await fs.remove(baseDir2)
    await fs.remove(baseDir3)
  })

  it('returns partial success with items when some uploads fail', async () => {
    const uploadMock = vi.fn(async (_input?: any[]) => {
      // Simulate: first item succeeds, second has no imgUrl (failed)
      return [
        { imgUrl: 'https://a.example/ok.png', origin: '/ok.png', fileName: 'ok.png' },
        { origin: '/fail.png', fileName: 'fail.png' }
      ] as IImgInfo[]
    })

    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true)

    const res = await fetch(`http://127.0.0.1:${port as number}/upload`, {
      method: 'POST',
      body: JSON.stringify({ list: ['/ok.png', '/fail.png'] })
    })

    expect(res.status).toBe(200)
    const json = await toJson(res)
    expect(json.success).toBe(true)
    expect(json.result).toEqual(['https://a.example/ok.png'])
    expect(json.items).toHaveLength(2)
    expect(json.items[0]).toEqual(expect.objectContaining({ imgUrl: 'https://a.example/ok.png', origin: '/ok.png' }))
    expect(json.items[1]).toEqual(expect.objectContaining({ origin: '/fail.png', fileName: 'fail.png' }))
    expect(json.items[1].imgUrl).toBeUndefined()

    server.shutdown()
    await fs.remove(baseDir)
  })

  it('returns failure when all uploads fail (no imgUrl in output)', async () => {
    const uploadMock = vi.fn(async () => {
      // Simulate: all items failed — no imgUrl on any
      return [
        { origin: '/a.png', fileName: 'a.png' },
        { origin: '/b.png', fileName: 'b.png' }
      ] as IImgInfo[]
    })

    const { ctx, baseDir } = await createMockCtx({
      settings: { server: { port: 0, host: '127.0.0.1' } }
    }, uploadMock)

    const server = new ServerManager(ctx)
    const port = await server.listen(0, '127.0.0.1', true)

    const res = await fetch(`http://127.0.0.1:${port as number}/upload`, {
      method: 'POST',
      body: JSON.stringify({ list: ['/a.png', '/b.png'] })
    })

    expect(res.status).toBe(500)
    const json = await toJson(res)
    expect(json.success).toBe(false)
    expect(json.result).toEqual([])
    expect(json.items).toHaveLength(2)
    expect(json.items[0]).toEqual(expect.objectContaining({ origin: '/a.png' }))
    expect(json.items[1]).toEqual(expect.objectContaining({ origin: '/b.png' }))
    expect(json.message).toBe('All uploads failed')

    server.shutdown()
    await fs.remove(baseDir)
  })
})
