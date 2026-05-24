import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import type { IFileUploadProgress, IPicGo } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { uploadWithProgress } from '../../utils/uploadWithProgress'

interface ProgressLike {
  loaded: number
  total?: number
}

const createCtx = (): {
  ctx: IPicGo
  emit: ReturnType<typeof vi.fn>
  request: ReturnType<typeof vi.fn>
} => {
  const emit = vi.fn()
  const request = vi.fn()
  const ctx = Object.assign(new EventEmitter(), {
    emit,
    request
  }) as unknown as IPicGo
  return { ctx, emit, request }
}

const collectFileUploadEvents = (emit: ReturnType<typeof vi.fn>): IFileUploadProgress[] => {
  return emit.mock.calls
    .filter(([event]) => event === IBuildInEvent.FILE_UPLOAD_PROGRESS)
    .map(([, payload]) => payload as IFileUploadProgress)
}

describe('uploadWithProgress', () => {
  it('passes through ctx.request result unchanged', async () => {
    const { ctx, request } = createCtx()
    request.mockResolvedValue('the-body')
    const result = await uploadWithProgress<string>(
      ctx,
      { method: 'POST', url: 'https://x' },
      { fileName: 'a.png' }
    )
    expect(result).toBe('the-body')
  })

  it('forwards the original config options to ctx.request', async () => {
    const { ctx, request } = createCtx()
    request.mockResolvedValue(undefined)
    await uploadWithProgress(
      ctx,
      { method: 'PUT', url: 'https://x', headers: { 'x-custom': '1' }, data: Buffer.from('hi') },
      { fileName: 'a.png' }
    )
    const sent = request.mock.calls[0][0] as AxiosRequestConfig
    expect(sent.method).toBe('PUT')
    expect(sent.url).toBe('https://x')
    expect(sent.headers).toMatchObject({ 'x-custom': '1' })
  })

  it('emits FILE_UPLOAD_PROGRESS when axios fires onUploadProgress', async () => {
    const { ctx, emit, request } = createCtx()
    request.mockImplementation((opts: AxiosRequestConfig) => {
      opts.onUploadProgress?.({ loaded: 50, total: 100 } as ProgressLike as never)
      opts.onUploadProgress?.({ loaded: 100, total: 100 } as ProgressLike as never)
      return Promise.resolve(undefined)
    })
    await uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, { fileName: 'a.png' })
    const events = collectFileUploadEvents(emit)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      fileName: 'a.png',
      current: 50,
      total: 100,
      fraction: 0.5,
      partsCompleted: -1,
      totalParts: -1,
      resumed: false
    })
    expect(events[1]).toMatchObject({ current: 100, fraction: 1 })
  })

  it('falls back to meta.totalBytes when axios progress lacks total', async () => {
    const { ctx, emit, request } = createCtx()
    request.mockImplementation((opts: AxiosRequestConfig) => {
      opts.onUploadProgress?.({ loaded: 30 } as ProgressLike as never)
      return Promise.resolve(undefined)
    })
    await uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, { fileName: 'a.png', totalBytes: 100 })
    const events = collectFileUploadEvents(emit)
    expect(events[0]).toMatchObject({ current: 30, total: 100, fraction: 0.3 })
  })

  it('emits fraction 0 when total is unknown (no axios total, no meta.totalBytes)', async () => {
    const { ctx, emit, request } = createCtx()
    request.mockImplementation((opts: AxiosRequestConfig) => {
      opts.onUploadProgress?.({ loaded: 30 } as ProgressLike as never)
      return Promise.resolve(undefined)
    })
    await uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, { fileName: 'a.png' })
    const events = collectFileUploadEvents(emit)
    expect(events[0]).toMatchObject({ current: 30, total: 0, fraction: 0 })
  })

  it('does not emit when axios never fires onUploadProgress', async () => {
    const { ctx, emit, request } = createCtx()
    request.mockResolvedValue('ok')
    await uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, { fileName: 'a.png' })
    expect(collectFileUploadEvents(emit)).toEqual([])
  })

  it('clips fraction at 1 when reported loaded > total (server quirk)', async () => {
    const { ctx, emit, request } = createCtx()
    request.mockImplementation((opts: AxiosRequestConfig) => {
      opts.onUploadProgress?.({ loaded: 150, total: 100 } as ProgressLike as never)
      return Promise.resolve(undefined)
    })
    await uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, { fileName: 'a.png' })
    expect(collectFileUploadEvents(emit)[0]?.fraction).toBe(1)
  })

  it('honors caller-provided resumed / partsCompleted / totalParts in payload', async () => {
    const { ctx, emit, request } = createCtx()
    request.mockImplementation((opts: AxiosRequestConfig) => {
      opts.onUploadProgress?.({ loaded: 50, total: 100 } as ProgressLike as never)
      return Promise.resolve(undefined)
    })
    await uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, {
      fileName: 'a.png',
      resumed: true,
      partsCompleted: 3,
      totalParts: 13
    })
    expect(collectFileUploadEvents(emit)[0]).toMatchObject({
      resumed: true,
      partsCompleted: 3,
      totalParts: 13
    })
  })

  it('rejects when ctx.request rejects', async () => {
    const { ctx, request } = createCtx()
    request.mockRejectedValue(new Error('network'))
    await expect(uploadWithProgress(ctx, { method: 'PUT', url: 'x' }, { fileName: 'a.png' }))
      .rejects.toThrow('network')
  })

  it('preserves an existing onUploadProgress on the input config (composes both)', async () => {
    const { ctx, emit, request } = createCtx()
    const callerHandler = vi.fn()
    request.mockImplementation((opts: AxiosRequestConfig) => {
      opts.onUploadProgress?.({ loaded: 50, total: 100 } as ProgressLike as never)
      return Promise.resolve(undefined)
    })
    await uploadWithProgress(
      ctx,
      { method: 'PUT', url: 'x', onUploadProgress: callerHandler },
      { fileName: 'a.png' }
    )
    expect(callerHandler).toHaveBeenCalledTimes(1)
    expect(collectFileUploadEvents(emit)).toHaveLength(1)
  })
})
