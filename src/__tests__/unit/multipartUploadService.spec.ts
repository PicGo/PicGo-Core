import { EventEmitter } from 'events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import type { IImgInfo, IFileUploadProgress, IPicGo, MultipartPartInfo } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import {
  MultipartUploadService,
  runMultipartUpload
} from '../../lib/Cloud/services/multipart/MultipartUploadService'
import { MultipartStorage } from '../../lib/Cloud/services/multipart/MultipartStorage'

const PART_SIZE = 8 * 1024 * 1024
const TOKEN = 'tok-123'
const USER_ID = createHash('sha1').update(TOKEN).digest('hex').slice(0, 16)

const fingerprintOf = (buffer: Buffer): string => {
  return createHash('sha1').update(buffer).digest('hex')
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async dir => {
    await rm(dir, { recursive: true, force: true })
  }))
  vi.useRealTimers()
})

interface CtxBundle {
  ctx: IPicGo
  request: ReturnType<typeof vi.fn>
  removeConfig: ReturnType<typeof vi.fn>
  baseDir: string
  service: MultipartUploadService
}

const createCtx = async (overrides: { token?: string | undefined } = {}): Promise<CtxBundle> => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'picgo-multipart-svc-'))
  tempDirs.push(baseDir)
  const request = vi.fn()
  const removeConfig = vi.fn()
  const token = 'token' in overrides ? overrides.token : TOKEN
  const ctx = Object.assign(new EventEmitter(), {
    baseDir,
    request,
    removeConfig,
    getConfig: vi.fn((key?: string) => {
      if (key === 'settings.picgoCloud.token') return token
      return undefined
    }),
    i18n: {
      translate: vi.fn((key: string) => key)
    },
    log: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
      createLogger: vi.fn(() => ({
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        debug: vi.fn()
      }))
    }
  }) as unknown as IPicGo
  const service = new MultipartUploadService(ctx)
  Object.assign(ctx, { cloud: { uploader: service } })
  return { ctx, request, removeConfig, baseDir, service }
}

interface MockRoutes {
  initiate?: () => unknown | Promise<unknown>
  partUrls?: (data: { partNumbers: number[] }) => unknown | Promise<unknown>
  multipartComplete?: () => unknown | Promise<unknown>
  abort?: () => unknown | Promise<unknown>
  partPut?: (partNumber: number, body: Buffer) => unknown | Promise<unknown>
  albumComplete?: () => unknown | Promise<unknown>
}

const wireRequest = (request: ReturnType<typeof vi.fn>, routes: MockRoutes): void => {
  request.mockImplementation(async (opts: AxiosRequestConfig) => {
    const url = opts.url ?? ''
    if (url.includes('/api/upload/multipart/initiate')) {
      if (!routes.initiate) throw new Error('unmocked initiate')
      return await routes.initiate()
    }
    if (url.includes('/api/upload/multipart/part-urls')) {
      if (!routes.partUrls) throw new Error('unmocked part-urls')
      return await routes.partUrls(opts.data as { partNumbers: number[] })
    }
    if (url.includes('/api/upload/multipart/complete')) {
      if (!routes.multipartComplete) throw new Error('unmocked multipart complete')
      return await routes.multipartComplete()
    }
    if (url.includes('/api/upload/multipart/abort')) {
      if (!routes.abort) throw new Error('unmocked abort')
      return await routes.abort()
    }
    if (url.includes('/api/album-items/complete')) {
      if (!routes.albumComplete) throw new Error('unmocked album-items complete')
      return await routes.albumComplete()
    }
    if (url.startsWith('https://r2.test/')) {
      const partNumberMatch = url.match(/[?&]partNumber=(\d+)/)
      const partNumber = partNumberMatch ? Number(partNumberMatch[1]) : 0
      if (!routes.partPut) throw new Error('unmocked part PUT')
      return await routes.partPut(partNumber, opts.data as Buffer)
    }
    throw new Error(`unmocked URL: ${url}`)
  })
}

const presignFor = (partNumbers: number[]): MultipartPartInfo[] => {
  return partNumbers.map(n => ({
    partNumber: n,
    url: `https://r2.test/key?partNumber=${n}`,
    method: 'PUT' as const,
    headers: {}
  }))
}

const successfulPartPut = (partNumber: number): { headers: Record<string, string>; status: number } => ({
  status: 200,
  headers: { etag: `"etag-${partNumber}"` }
})

const makeBuffer = (sizeBytes: number): Buffer => {
  const buf = Buffer.alloc(sizeBytes)
  for (let i = 0; i < sizeBytes; i++) buf[i] = i % 256
  return buf
}

const collectProgressEvents = (ctx: IPicGo): IFileUploadProgress[] => {
  const emitter = ctx as unknown as EventEmitter
  const events: IFileUploadProgress[] = []
  emitter.on(IBuildInEvent.FILE_UPLOAD_PROGRESS, (payload: IFileUploadProgress) => events.push(payload))
  return events
}

const buildAlbumCompleteSuccess = (overrides: Record<string, unknown> = {}): {
  success: true
  data: { item: Record<string, unknown> }
} => ({
  success: true,
  data: {
    item: {
      id: 'item-1',
      imgUrl: 'https://cdn.example/key.jpg',
      width: 100,
      height: 200,
      size: 12 * 1024 * 1024,
      contentType: 'video/mp4',
      ...overrides
    }
  }
})

const buildInitiateSuccess = (size: number): {
  success: true
  uploadId: string
  objectKey: string
  publicId: string
  url: string
  partSize: number
  partCount: number
  parts: MultipartPartInfo[]
} => {
  const partCount = Math.ceil(size / PART_SIZE)
  const partNumbers = Array.from({ length: partCount }, (_, i) => i + 1)
  return {
    success: true,
    uploadId: 'upload-1',
    objectKey: `${USER_ID}/key.bin`,
    publicId: 'pub-1',
    url: 'https://cdn.example/key.jpg',
    partSize: PART_SIZE,
    partCount,
    parts: presignFor(partNumbers)
  }
}

describe('MultipartUploadService — public API (abort / listPending / removePending)', () => {
  it('abort posts to /api/upload/multipart/abort with bearer token', async () => {
    const { ctx, request, service } = await createCtx()
    request.mockResolvedValue({ success: true })
    await service.abort('upload-X', 'objectKey-X')
    const call = request.mock.calls[0][0] as AxiosRequestConfig
    expect(call.url).toContain('/api/upload/multipart/abort')
    expect(call.data).toEqual({ uploadId: 'upload-X', objectKey: 'objectKey-X' })
    expect((call.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    void ctx
  })

  it('abort swallows server errors (best-effort)', async () => {
    const { request, service } = await createCtx()
    request.mockRejectedValue(new Error('404'))
    await expect(service.abort('upload-X', 'objectKey-X')).resolves.toBeUndefined()
  })

  it('abort is a no-op when no token (logged out)', async () => {
    const { request, service } = await createCtx({ token: undefined })
    await service.abort('upload-X', 'objectKey-X')
    expect(request).not.toHaveBeenCalled()
  })

  it('listPending returns sessions only for the current user', async () => {
    const { ctx, service } = await createCtx()
    const storage = new MultipartStorage(ctx)
    storage.set(USER_ID, 'fp-A', {
      v: 1,
      uploadId: 'u-A',
      objectKey: 'k',
      publicId: 'p',
      url: 'u',
      filename: 'f',
      size: 100,
      contentType: 'x',
      partSize: PART_SIZE,
      partCount: 1,
      completedParts: [],
      createdAt: Date.now()
    })
    storage.set('other-user', 'fp-X', {
      v: 1,
      uploadId: 'u-X',
      objectKey: 'k',
      publicId: 'p',
      url: 'u',
      filename: 'f',
      size: 100,
      contentType: 'x',
      partSize: PART_SIZE,
      partCount: 1,
      completedParts: [],
      createdAt: Date.now()
    })
    const pending = service.listPending()
    expect(pending.map(p => p.uploadId)).toEqual(['u-A'])
  })

  it('removePending only deletes the matching local fingerprint', async () => {
    const { ctx, service } = await createCtx()
    const storage = new MultipartStorage(ctx)
    const session = {
      v: 1 as const,
      uploadId: 'u-A',
      objectKey: 'k',
      publicId: 'p',
      url: 'u',
      filename: 'f',
      size: 100,
      contentType: 'x',
      partSize: PART_SIZE,
      partCount: 1,
      completedParts: [],
      createdAt: Date.now()
    }
    storage.set(USER_ID, 'fp-A', session)
    storage.set(USER_ID, 'fp-B', { ...session, uploadId: 'u-B' })
    service.removePending('fp-A')
    expect(storage.get(USER_ID, 'fp-A')).toBeNull()
    expect(storage.get(USER_ID, 'fp-B')?.uploadId).toBe('u-B')
  })
})

describe('runMultipartUpload — happy path', () => {
  it('uploads a 12MB buffer as 2 parts and finalizes via album-items/complete', async () => {
    const { ctx, request } = await createCtx()
    const events = collectProgressEvents(ctx)
    const buffer = makeBuffer(12 * 1024 * 1024)
    const fingerprint = fingerprintOf(buffer)

    wireRequest(request, {
      initiate: () => buildInitiateSuccess(buffer.length),
      multipartComplete: () => ({ success: true }),
      albumComplete: () => buildAlbumCompleteSuccess(),
      partPut: (partNumber: number) => successfulPartPut(partNumber)
    })

    const img: IImgInfo = { fileName: 'big.mp4', buffer, contentType: 'video/mp4' }
    const result = await runMultipartUpload(ctx, img)
    expect(result.imgUrl).toBe('https://cdn.example/key.jpg')
    expect(result.width).toBe(100)

    // 2 parts uploaded
    const partPuts = request.mock.calls.filter(call => (call[0].url as string).startsWith('https://r2.test'))
    expect(partPuts).toHaveLength(2)

    // local session cleared after success
    const storage = new MultipartStorage(ctx)
    expect(storage.get(USER_ID, fingerprint)).toBeNull()

    // progress events: initial (0 parts) → 1/2 → 2/2
    expect(events.length).toBeGreaterThanOrEqual(3)
    const last = events[events.length - 1]
    expect(last.partsCompleted).toBe(2)
    expect(last.totalParts).toBe(2)
    expect(last.fraction).toBe(1)
    expect(last.fileName).toBe('big.mp4')
    expect(last.resumed).toBe(false)
  })
})

describe('runMultipartUpload — resume', () => {
  it('skips already-completed parts and emits resumed=true progress', async () => {
    const { ctx, request } = await createCtx()
    const buffer = makeBuffer(20 * 1024 * 1024) // 3 parts
    const fingerprint = fingerprintOf(buffer)

    const storage = new MultipartStorage(ctx)
    storage.set(USER_ID, fingerprint, {
      v: 1,
      uploadId: 'upload-1',
      objectKey: `${USER_ID}/key.bin`,
      publicId: 'pub-1',
      url: 'https://cdn.example/key.jpg',
      filename: 'big.mp4',
      size: buffer.length,
      contentType: 'video/mp4',
      partSize: PART_SIZE,
      partCount: 3,
      completedParts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' }
      ],
      createdAt: Date.now()
    })

    const events = collectProgressEvents(ctx)
    let partUrlsCalled = false
    wireRequest(request, {
      // initiate should NOT be called on resume
      initiate: () => { throw new Error('initiate must not be called on resume') },
      partUrls: () => {
        partUrlsCalled = true
        return { success: true, parts: presignFor([3]) }
      },
      multipartComplete: () => ({ success: true }),
      albumComplete: () => buildAlbumCompleteSuccess(),
      partPut: (partNumber: number) => successfulPartPut(partNumber)
    })

    const result = await runMultipartUpload(ctx, { fileName: 'big.mp4', buffer })
    expect(result.imgUrl).toBe('https://cdn.example/key.jpg')
    expect(partUrlsCalled).toBe(true)

    const partPuts = request.mock.calls.filter(call => (call[0].url as string).startsWith('https://r2.test'))
    expect(partPuts).toHaveLength(1) // only part 3 was uploaded

    const resumedEvents = events.filter(e => e.resumed === true)
    expect(resumedEvents.length).toBeGreaterThan(0)
  })

  it('complete-only resume skips part loop entirely', async () => {
    const { ctx, request } = await createCtx()
    const buffer = makeBuffer(12 * 1024 * 1024) // 2 parts
    const fingerprint = fingerprintOf(buffer)

    const storage = new MultipartStorage(ctx)
    storage.set(USER_ID, fingerprint, {
      v: 1,
      uploadId: 'upload-1',
      objectKey: `${USER_ID}/key.bin`,
      publicId: 'pub-1',
      url: 'https://cdn.example/key.jpg',
      filename: 'big.mp4',
      size: buffer.length,
      contentType: 'video/mp4',
      partSize: PART_SIZE,
      partCount: 2,
      completedParts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' }
      ],
      createdAt: Date.now()
    })

    wireRequest(request, {
      initiate: () => { throw new Error('must not initiate') },
      multipartComplete: () => ({ success: true }),
      albumComplete: () => buildAlbumCompleteSuccess(),
      partPut: () => { throw new Error('must not PUT') }
    })

    const result = await runMultipartUpload(ctx, { fileName: 'big.mp4', buffer })
    expect(result.imgUrl).toBe('https://cdn.example/key.jpg')
  })
})

describe('runMultipartUpload — 403 refresh', () => {
  it('refreshes presign URLs when a part PUT returns 403, then succeeds', async () => {
    const { ctx, request } = await createCtx()
    const buffer = makeBuffer(12 * 1024 * 1024) // 2 parts
    let refreshCount = 0
    let firstAttemptOnPart1 = true

    wireRequest(request, {
      initiate: () => buildInitiateSuccess(buffer.length),
      partUrls: () => {
        refreshCount++
        return { success: true, parts: presignFor([1, 2]) }
      },
      multipartComplete: () => ({ success: true }),
      albumComplete: () => buildAlbumCompleteSuccess(),
      partPut: (partNumber: number) => {
        if (partNumber === 1 && firstAttemptOnPart1) {
          firstAttemptOnPart1 = false
          // simulate axios error with 403
          const err = Object.assign(new Error('forbidden'), {
            isAxiosError: true,
            response: { status: 403, data: {} }
          })
          throw err
        }
        return successfulPartPut(partNumber)
      }
    })

    const result = await runMultipartUpload(ctx, { fileName: 'big.mp4', buffer })
    expect(result.imgUrl).toBe('https://cdn.example/key.jpg')
    expect(refreshCount).toBe(1)
  })
})

describe('runMultipartUpload — 404 fatal', () => {
  it('on 404, clears local session and throws MULTIPART_NOT_FOUND', async () => {
    const { ctx, request } = await createCtx()
    const buffer = makeBuffer(12 * 1024 * 1024)
    const fingerprint = fingerprintOf(buffer)
    const storage = new MultipartStorage(ctx)

    wireRequest(request, {
      initiate: () => buildInitiateSuccess(buffer.length),
      partPut: () => {
        const err = Object.assign(new Error('not found'), {
          isAxiosError: true,
          response: { status: 404, data: {} }
        })
        throw err
      }
    })

    await expect(runMultipartUpload(ctx, { fileName: 'big.mp4', buffer }))
      .rejects.toThrow('PICGO_CLOUD_UPLOAD_MULTIPART_NOT_FOUND')
    expect(storage.get(USER_ID, fingerprint)).toBeNull()
  })
})

describe('runMultipartUpload — 5xx backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retries 3 times with exponential backoff then throws, preserves local session', async () => {
    const { ctx, request } = await createCtx()
    const buffer = makeBuffer(9 * 1024 * 1024) // 2 parts (9MB → 8 + 1)
    const fingerprint = fingerprintOf(buffer)
    const storage = new MultipartStorage(ctx)

    let part1Calls = 0
    wireRequest(request, {
      initiate: () => buildInitiateSuccess(buffer.length),
      multipartComplete: () => ({ success: true }),
      albumComplete: () => buildAlbumCompleteSuccess(),
      partPut: (partNumber: number) => {
        if (partNumber === 1) {
          part1Calls++
          const err = Object.assign(new Error('server error'), {
            isAxiosError: true,
            response: { status: 503, data: {} }
          })
          throw err
        }
        return successfulPartPut(partNumber)
      }
    })

    // 捕获 rejection 到一个 settle 状态，避免 vi.runAllTimersAsync 期间出现"未处理的 rejection"
    const capture = runMultipartUpload(ctx, { fileName: 'big.mp4', buffer }).then(
      () => ({ ok: true as const }),
      (e: Error) => ({ ok: false as const, error: e })
    )
    // advance through all 3 backoff windows (1s + 2s + 4s) and resolved microtasks
    await vi.runAllTimersAsync()
    const result = await capture
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('PICGO_CLOUD_UPLOAD_MULTIPART_PART_FAILED')
    }
    expect(part1Calls).toBe(4) // initial + 3 retries
    // local session preserved for next attempt
    expect(storage.get(USER_ID, fingerprint)).not.toBeNull()
  })
})

describe('runMultipartUpload — 401 relogin', () => {
  it('clears token and throws relogin error when initiate returns 401', async () => {
    const { ctx, request, removeConfig } = await createCtx()
    const buffer = makeBuffer(12 * 1024 * 1024)
    wireRequest(request, {
      initiate: () => {
        const err = Object.assign(new Error('unauthorized'), {
          isAxiosError: true,
          response: { status: 401, data: {} }
        })
        throw err
      }
    })
    await expect(runMultipartUpload(ctx, { fileName: 'big.mp4', buffer }))
      .rejects.toThrow('PICGO_CLOUD_UPLOAD_RELOGIN_REQUIRED')
    expect(removeConfig).toHaveBeenCalledWith('settings.picgoCloud', 'token')
  })
})

describe('runMultipartUpload — validation', () => {
  it('throws LOGIN_REQUIRED when no token is configured', async () => {
    const { ctx } = await createCtx({ token: undefined })
    const buffer = makeBuffer(12 * 1024 * 1024)
    await expect(runMultipartUpload(ctx, { fileName: 'big.mp4', buffer }))
      .rejects.toThrow('PICGO_CLOUD_UPLOAD_LOGIN_REQUIRED')
  })

  it('throws MISSING_FILE_NAME when img has no fileName', async () => {
    const { ctx } = await createCtx()
    const buffer = makeBuffer(12 * 1024 * 1024)
    await expect(runMultipartUpload(ctx, { buffer }))
      .rejects.toThrow('PICGO_CLOUD_UPLOAD_MISSING_FILE_NAME')
  })

  it('throws MISSING_FILE_DATA when img has neither buffer nor base64', async () => {
    const { ctx } = await createCtx()
    await expect(runMultipartUpload(ctx, { fileName: 'big.mp4' }))
      .rejects.toThrow('PICGO_CLOUD_UPLOAD_MISSING_FILE_DATA')
  })
})
