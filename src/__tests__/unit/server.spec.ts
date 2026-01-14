import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { get, set } from 'lodash'
import { ServerManager } from '../../lib/Server'
import type { IPicGo, IImgInfo } from '../../types'

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

const createMockCtx = async (
  initialConfig: Record<string, unknown>,
  uploadMock: (input?: any[]) => Promise<IImgInfo[] | Error>
): Promise<{
  ctx: IPicGo
  log: ILogSpy
  baseDir: string
  getConfigMock: ReturnType<typeof vi.fn>
  saveConfigMock: ReturnType<typeof vi.fn>
}> => {
  const config: Record<string, unknown> = structuredClone(initialConfig)
  const baseDir = await createTempDir('picgo-core-server-')

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

  const ctx = {
    baseDir,
    log,
    getConfig: getConfigMock,
    saveConfig: saveConfigMock,
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
  afterEach(() => {
    vi.restoreAllMocks()
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
    expect(await toJson(resEmpty)).toEqual({ success: true, result: ['https://a.example/clipboard.png'] })

    const resObj = await fetch(`${baseUrl}/upload`, { method: 'POST', body: '{}' })
    expect(resObj.status).toBe(200)
    expect(await toJson(resObj)).toEqual({ success: true, result: ['https://a.example/clipboard.png'] })

    const resEmptyList = await fetch(`${baseUrl}/upload`, { method: 'POST', body: JSON.stringify({ list: [] }) })
    expect(resEmptyList.status).toBe(200)
    expect(await toJson(resEmptyList)).toEqual({ success: true, result: ['https://a.example/clipboard.png'] })

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
      ]
    })

    const resInvalidJson = await fetch(`${baseUrl}/upload`, { method: 'POST', body: '{' })
    expect(resInvalidJson.status).toBe(400)
    expect(await toJson(resInvalidJson)).toMatchObject({ success: false })

    // upload() called: empty, {}, {list:[]}, list
    expect(uploadMock).toHaveBeenCalledTimes(4)

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
    expect(await toJson(res)).toEqual({ success: true, result: ['https://a.example/form.png'] })

    expect(uploadedFiles.length).toBeGreaterThan(0)
    for (const filePath of uploadedFiles) {
      expect(await fs.pathExists(filePath)).toBe(false)
    }

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
})
