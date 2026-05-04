import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AuthRequestClient } from '../../lib/Cloud/Request'
import { AlbumService } from '../../lib/Cloud/services/AlbumService'
import type { IImgInfo, IPicGo } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { PICGO_CLOUD_IMPORT_PENDING_FILE } from '../../utils/static'

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  return {
    ...actual,
    randomUUID: vi.fn(() => 'generated-id')
  }
})

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }))
})

const createCtx = async (): Promise<{
  ctx: IPicGo
  request: ReturnType<typeof vi.fn>
  log: {
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    success: ReturnType<typeof vi.fn>
    debug: ReturnType<typeof vi.fn>
  }
}> => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'picgo-album-service-'))
  tempDirs.push(baseDir)

  const translate = vi.fn((key: string, args?: Record<string, string>) => {
    if (key === 'CLOUD_ALBUM_PENDING_INVALID_FILE') {
      return `pending invalid: ${args?.path ?? ''}`
    }

    if (key === 'CLOUD_ALBUM_IMPORT_AUTO_IMPORT_DISABLED') {
      return 'auto import disabled'
    }

    if (key === 'CLOUD_ALBUM_IMPORT_DUPLICATE_ID') {
      return 'already imported'
    }

    if (key === 'PICGO_CLOUD_UPLOAD_RELOGIN_REQUIRED') {
      return 'relogin required'
    }

    return key
  })

  const log = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn()
  }
  const request = vi.fn()
  const ctx = Object.assign(new EventEmitter(), {
    baseDir,
    i18n: {
      translate
    },
    log,
    request,
    getConfig: vi.fn(),
    removeConfig: vi.fn(),
    saveConfig: vi.fn(),
    setConfig: vi.fn(),
    unsetConfig: vi.fn()
  }) as unknown as IPicGo

  return {
    ctx,
    request,
    log
  }
}

const createService = async (): Promise<{
  ctx: IPicGo
  request: ReturnType<typeof vi.fn>
  service: AlbumService
  log: {
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    success: ReturnType<typeof vi.fn>
    debug: ReturnType<typeof vi.fn>
  }
}> => {
  const { ctx, request, log } = await createCtx()
  const client = {
    request
  } as unknown as AuthRequestClient

  return {
    ctx,
    request,
    service: new AlbumService(ctx, client),
    log
  }
}

describe('AlbumService CRUD', () => {
  it('calls the expected CRUD endpoints', async () => {
    const { service, request } = await createService()

    request
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [],
          total: 0,
          limit: 20,
          offset: 0
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          item: {
            id: 'item-1'
          }
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          item: {
            id: 'item-1',
            fileName: 'demo.png'
          }
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          message: 'Deleted'
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          deleted: 2
        }
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          contentTypes: ['image/png'],
          exts: ['png']
        }
      })

    await expect(service.list()).resolves.toEqual({
      success: true,
      items: [],
      total: 0,
      limit: 20,
      offset: 0
    })
    await expect(service.get('item-1')).resolves.toEqual({
      id: 'item-1'
    })
    await expect(service.update('item-1', { fileName: 'demo.png' })).resolves.toEqual({
      id: 'item-1',
      fileName: 'demo.png'
    })
    await expect(service.delete('item-1')).resolves.toBeUndefined()
    await expect(service.delete(['item-1', 'item-2'])).resolves.toBeUndefined()
    await expect(service.getFilters()).resolves.toEqual({
      success: true,
      contentTypes: ['image/png'],
      exts: ['png']
    })

    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      url: '/api/album-items',
      params: {
        limit: 20,
        offset: 0
      }
    })
  })

  it('passes type as a query parameter in list', async () => {
    const { service, request } = await createService()

    request.mockResolvedValueOnce({
      success: true,
      data: {
        items: [],
        total: 0,
        limit: 20,
        offset: 0
      }
    })

    await service.list({ type: 'smms' })

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/api/album-items',
      params: {
        limit: 20,
        offset: 0,
        type: 'smms'
      }
    })
  })

  it('calls batchUpdate with the expected payload', async () => {
    const { service, request } = await createService()

    request.mockResolvedValueOnce({
      success: true,
      data: {
        updated: 2,
        skipped: 0,
        items: [
          { id: 'item-1', imgUrl: 'https://new.example.com/1.png' },
          { id: 'item-2', imgUrl: 'https://new.example.com/2.png' }
        ]
      }
    })

    const result = await service.batchUpdate([
      { id: 'item-1', data: { imgUrl: 'https://new.example.com/1.png' } },
      { id: 'item-2', data: { imgUrl: 'https://new.example.com/2.png', extname: '.png', size: 1024 } }
    ])

    expect(result).toEqual({
      updated: 2,
      skipped: 0,
      items: [
        { id: 'item-1', imgUrl: 'https://new.example.com/1.png' },
        { id: 'item-2', imgUrl: 'https://new.example.com/2.png' }
      ]
    })
    expect(request).toHaveBeenCalledWith({
      method: 'PATCH',
      url: '/api/album-items',
      data: {
        items: [
          { id: 'item-1', imgUrl: 'https://new.example.com/1.png' },
          { id: 'item-2', imgUrl: 'https://new.example.com/2.png' }
        ]
      }
    })
  })

  it('returns empty result for batchUpdate with no items', async () => {
    const { service, request } = await createService()

    const result = await service.batchUpdate([])

    expect(result).toEqual({ updated: 0, skipped: 0, items: [] })
    expect(request).not.toHaveBeenCalled()
  })
})

describe('AlbumService import', () => {
  it('normalizes items, skips invalid data, and maps mimeType to contentType', async () => {
    const { service, request } = await createService()

    request.mockResolvedValueOnce({
      success: true,
      data: {
        created: 2,
        skipped: 0,
        items: []
      }
    })

    const result = await service.import([
      {
        imgUrl: 'https://img.example.com/a.png',
        mimeType: 'image/png'
      },
      {
        id: 'keep-id',
        imgUrl: 'https://img.example.com/b.png',
        contentType: 'image/jpeg'
      },
      {
        fileName: 'invalid.png'
      }
    ])

    expect(result).toEqual({
      total: 3,
      created: 2,
      skipped: 0,
      invalid: 1,
      failed: 0,
      pending: 0,
      items: []
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/api/album-items',
      data: {
        items: [
          {
            id: 'generated-id',
            imgUrl: 'https://img.example.com/a.png',
            contentType: 'image/png'
          },
          {
            id: 'keep-id',
            imgUrl: 'https://img.example.com/b.png',
            contentType: 'image/jpeg'
          }
        ]
      }
    })
  })

  it('splits imports into 100-item batches', async () => {
    const { service, request } = await createService()

    request.mockImplementation((config: { data: { items: IImgInfo[] } }) => {
      return {
        success: true,
        data: {
          created: config.data.items.length,
          skipped: 0,
          items: config.data.items
        }
      }
    })

    const items = Array.from({ length: 250 }, (_, index) => {
      return {
        id: `item-${index}`,
        imgUrl: `https://img.example.com/${index}.png`
      }
    })

    const result = await service.import(items)

    expect(result.created).toBe(250)
    expect(request).toHaveBeenCalledTimes(3)
    expect((request.mock.calls[0][0] as { data: { items: IImgInfo[] } }).data.items).toHaveLength(100)
    expect((request.mock.calls[1][0] as { data: { items: IImgInfo[] } }).data.items).toHaveLength(100)
    expect((request.mock.calls[2][0] as { data: { items: IImgInfo[] } }).data.items).toHaveLength(50)
  })

  it('retries transient failures and persists failed plus remaining items to pending', async () => {
    const { service, request } = await createService()

    request.mockRejectedValue({
      isAxiosError: true,
      message: 'server error',
      response: {
        status: 500,
        data: {
          message: 'server error'
        }
      }
    })

    const items = Array.from({ length: 150 }, (_, index) => {
      return {
        id: `item-${index}`,
        imgUrl: `https://img.example.com/${index}.png`
      }
    })

    const result = await service.import(items)

    expect(request).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      total: 150,
      created: 0,
      skipped: 0,
      invalid: 0,
      failed: 100,
      pending: 150,
      items: []
    })
    expect(await service.getPending()).toHaveLength(150)
  })

  it('uses backend error code to detect import-disabled responses', async () => {
    const { service, request } = await createService()

    request.mockRejectedValue({
      isAxiosError: true,
      message: 'forbidden',
      response: {
        status: 403,
        data: {
          code: 'IMPORT_DISABLED',
          message: 'Album import is disabled'
        }
      }
    })

    await expect(service.import([{
      id: 'item-1',
      imgUrl: 'https://img.example.com/1.png'
    }])).rejects.toMatchObject({
      message: 'auto import disabled',
      apiCode: 'IMPORT_DISABLED',
      status: 403
    })
  })

  it('uses backend error code to detect duplicate-id responses', async () => {
    const { service, request } = await createService()

    request.mockRejectedValue({
      isAxiosError: true,
      message: 'duplicate',
      response: {
        status: 409,
        data: {
          code: 'DUPLICATE_ID',
          message: 'Duplicate id'
        }
      }
    })

    await expect(service.import([{
      id: 'item-1',
      imgUrl: 'https://img.example.com/1.png'
    }])).rejects.toMatchObject({
      message: 'already imported',
      apiCode: 'DUPLICATE_ID',
      status: 409
    })
  })

  it('emits progress events after each completed batch', async () => {
    const { ctx, service, request } = await createService()
    const emitSpy = vi.spyOn(ctx, 'emit')

    request.mockImplementation((config: { data: { items: IImgInfo[] } }) => {
      return {
        success: true,
        data: {
          created: config.data.items.length,
          skipped: 0,
          items: config.data.items
        }
      }
    })

    await service.import(Array.from({ length: 120 }, (_, index) => {
      return {
        id: `item-${index}`,
        imgUrl: `https://img.example.com/${index}.png`
      }
    }))

    const progressCalls = emitSpy.mock.calls.filter(([eventName]) => eventName === IBuildInEvent.CLOUD_IMPORT_PROGRESS)
    expect(progressCalls).toHaveLength(2)
    expect(progressCalls[0][1]).toMatchObject({
      total: 120,
      current: 100,
      batchIndex: 1,
      batchTotal: 2,
      created: 100,
      skipped: 0,
      failed: 0
    })
    expect(progressCalls[1][1]).toMatchObject({
      total: 120,
      current: 120,
      batchIndex: 2,
      batchTotal: 2,
      created: 120,
      skipped: 0,
      failed: 0
    })
  })
})

describe('AlbumService pending queue', () => {
  it('returns an empty queue and logs a warning when the pending file is invalid', async () => {
    const { ctx, service, log } = await createService()

    await writeFile(path.join(ctx.baseDir, PICGO_CLOUD_IMPORT_PENDING_FILE), 'not-json', 'utf8')

    await expect(service.getPending()).resolves.toEqual([])
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('pending invalid:'))
  })

  it('filters pending items without both id and imgUrl', async () => {
    const { ctx, service } = await createService()

    await writeFile(path.join(ctx.baseDir, PICGO_CLOUD_IMPORT_PENDING_FILE), JSON.stringify([
      {
        id: 'item-1',
        imgUrl: 'https://img.example.com/1.png'
      },
      {
        imgUrl: 'https://img.example.com/2.png'
      },
      {
        id: 'item-3'
      }
    ]), 'utf8')

    await expect(service.getPending()).resolves.toEqual([
      {
        id: 'item-1',
        imgUrl: 'https://img.example.com/1.png'
      }
    ])
  })

  it('retries pending items and clears them when the import succeeds', async () => {
    const { service, request } = await createService()

    await service.addToPending([
      {
        id: 'item-1',
        imgUrl: 'https://img.example.com/1.png'
      },
      {
        id: 'item-2',
        imgUrl: 'https://img.example.com/2.png'
      }
    ])

    request.mockResolvedValueOnce({
      success: true,
      data: {
        created: 2,
        skipped: 0,
        items: [
          {
            id: 'item-1',
            imgUrl: 'https://img.example.com/1.png'
          },
          {
            id: 'item-2',
            imgUrl: 'https://img.example.com/2.png'
          }
        ]
      }
    })

    const result = await service.retryPending()

    expect(result).toEqual({
      total: 2,
      created: 2,
      skipped: 0,
      invalid: 0,
      failed: 0,
      pending: 0,
      items: [
        {
          id: 'item-1',
          imgUrl: 'https://img.example.com/1.png'
        },
        {
          id: 'item-2',
          imgUrl: 'https://img.example.com/2.png'
        }
      ]
    })
    expect(await service.getPending()).toEqual([])
  })
})
