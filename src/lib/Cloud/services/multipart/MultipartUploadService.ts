import axios, { AxiosRequestConfig } from 'axios'
import { createHash } from 'node:crypto'
import mime from 'mime-types'
import type { FileUploadResult } from '../FileService'
import type {
  ICloudUploaderManager,
  IFileUploadProgress,
  IImgInfo,
  ILogger,
  IPicGo,
  IReqOptions,
  MultipartCompletedPart,
  MultipartPartInfo,
  MultipartSession
} from '../../../../types'
import type { ILocalesKey } from '../../../../i18n/zh-CN'
import { IBuildInEvent } from '../../../../utils/enum'
import {
  AuthRequestClient,
  createCloudServiceError,
  getCloudErrorCode,
  getCloudErrorMessage,
  getCloudErrorStatus
} from '../../Request'
import { MultipartStorage } from './MultipartStorage'

/**
 * Concurrency for part PUTs. 3 is inherited from the browser version's empirically tuned value ——
 * 3 × 8MB = 24MB peak memory overhead, fine on desktop; a single PUT can already saturate typical
 * upstream bandwidth so adding more parallelism gives diminishing returns while memory grows linearly.
 */
const CONCURRENCY = 3

/** Exponential backoff for transient part failures: sleep 1s / 2s / 4s before retries 1/2/3, then surface. */
const BACKOFF_DELAYS_MS = [1000, 2000, 4000]

interface InitiateResponse {
  success?: boolean
  uploadId?: string
  objectKey?: string
  publicId?: string
  url?: string
  partSize?: number
  partCount?: number
  parts?: MultipartPartInfo[]
  message?: string
}

interface PartUrlsResponse {
  success?: boolean
  parts?: MultipartPartInfo[]
  message?: string
}

interface CompleteResponse {
  success?: boolean
  data?: {
    item: {
      id: string
      imgUrl: string
      width?: number
      height?: number
      size?: number
      contentType?: string
    }
  }
  message?: string
}

type PartUploadInput = {
  state: MultipartSession
  userId: string
  fingerprint: string
  fileName: string
  buffer: Buffer
  partUrls: Map<number, MultipartPartInfo>
  completed: Map<number, MultipartCompletedPart>
  emitProgress: (resumed: boolean) => void
  refreshUrls: () => Promise<void>
  diagLogger: ILogger | undefined
  internalAbort: AbortController
  authClient: AuthRequestClient
  ctx: IPicGo
  token: string
  resumed: boolean
}

class PartHttpError extends Error {
  readonly status: number
  constructor (message: string, status: number) {
    super(message)
    this.name = 'PartHttpError'
    this.status = status
  }
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const computeFingerprint = (buffer: Buffer): string => {
  return createHash('sha1').update(buffer).digest('hex')
}

const deriveUserId = (token: string): string => {
  return createHash('sha1').update(token).digest('hex').slice(0, 16)
}

const getBuffer = (img: IImgInfo): Buffer => {
  if (img.buffer) return img.buffer
  if (img.base64Image) return Buffer.from(img.base64Image, 'base64')
  throw new Error('missing-file-data')
}

const getContentType = (img: IImgInfo, fileName: string): string => {
  const explicit = img.contentType?.trim() || img.mimeType?.trim()
  if (explicit) return explicit
  const inferred = mime.lookup(fileName)
  return typeof inferred === 'string' ? inferred : 'application/octet-stream'
}

const indexParts = (parts: MultipartPartInfo[]): Map<number, MultipartPartInfo> => {
  const map = new Map<number, MultipartPartInfo>()
  for (const p of parts) map.set(p.partNumber, p)
  return map
}

/**
 * PicGo Cloud multipart upload service. Two responsibilities:
 *
 * 1. **State machine** (`runMultipartUpload` function, called by FileService's size dispatch):
 *    initiate → concurrent part PUTs → complete, with local session persistence so a crashed /
 *    interrupted upload can resume on the next attempt for the same file.
 *
 * 2. **Management API** (this class's abort / listPending / removePending): exposed to picgo-gui
 *    for a future "clean up pending uploads" UI. Mounted on `ctx.cloud.uploader`.
 *
 * Sessions left over by failure / crash are double-protected: server-side R2 lifecycle cleans
 * orphan multipart uploads after 7 days, local TTL also sweeps after 7 days. We intentionally
 * do NOT abort the remote session on state-machine failure, otherwise resume would be defeated.
 */
export class MultipartUploadService implements ICloudUploaderManager {
  private readonly ctx: IPicGo
  private readonly authClient: AuthRequestClient
  private readonly storage: MultipartStorage
  private readonly diagLogger: ILogger | undefined

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.authClient = new AuthRequestClient(ctx)
    this.storage = new MultipartStorage(ctx)
    this.diagLogger = ctx.log.createLogger?.({
      consoleOutput: false,
      respectSilent: false
    })
  }

  /**
   * Best-effort abort of a remote multipart upload session.
   * Swallows all errors (R2's 7-day lifecycle is the safety net); callers don't need try/catch.
   */
  async abort (uploadId: string, objectKey: string): Promise<void> {
    const token = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
    if (!token) return
    try {
      await this.authClient.request({
        method: 'POST',
        url: '/api/upload/multipart/abort',
        data: { uploadId, objectKey }
      }, token)
    } catch (error) {
      this.diagLogger?.warn(`[multipart-abort] failed for ${uploadId}: ${getCloudErrorMessage(error)}`)
    }
  }

  /** List all local pending multipart sessions belonging to the currently logged-in user. */
  listPending (): MultipartSession[] {
    const token = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
    if (!token) return []
    const userId = deriveUserId(token)
    return this.storage.listForUser(userId).map(entry => entry.session)
  }

  /** Delete only the local entry; does not notify the remote (call abort for that). */
  removePending (fingerprint: string): void {
    const token = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
    if (!token) return
    const userId = deriveUserId(token)
    this.storage.remove(userId, fingerprint)
  }

  // Internal helper exposed to same-module runMultipartUpload so it can reuse the logger / storage instances.
  /** @internal */
  getInternals (): {
    ctx: IPicGo
    authClient: AuthRequestClient
    storage: MultipartStorage
    diagLogger: ILogger | undefined
  } {
    return {
      ctx: this.ctx,
      authClient: this.authClient,
      storage: this.storage,
      diagLogger: this.diagLogger
    }
  }
}

/**
 * Run a full multipart upload: fingerprint → get/create session → concurrent part uploads → complete.
 * Called by FileService.upload when buffer size >= MULTIPART_THRESHOLD_BYTES.
 *
 * Deliberately not exposed on `ctx.cloud.uploader`: GUI / external plugins should go through
 * FileService so the size dispatch (single-PUT vs multipart) stays in one place.
 */
export async function runMultipartUpload (ctx: IPicGo, img: IImgInfo): Promise<FileUploadResult> {
  const token = ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
  if (!token) {
    throw new Error(ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_LOGIN_REQUIRED'))
  }

  const fileName = img.fileName?.trim()
  if (!fileName) {
    throw new Error(ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MISSING_FILE_NAME'))
  }

  let buffer: Buffer
  try {
    buffer = getBuffer(img)
  } catch {
    throw new Error(ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MISSING_FILE_DATA'))
  }

  const contentType = getContentType(img, fileName)
  const userId = deriveUserId(token)
  const fingerprint = computeFingerprint(buffer)

  const uploader = ctx.cloud.uploader as MultipartUploadService
  const { authClient, storage, diagLogger } = uploader.getInternals()

  storage.sweepExpired()

  const existing = storage.get(userId, fingerprint)
  const resumed = existing !== null
  let state: MultipartSession
  let partUrls: Map<number, MultipartPartInfo>
  if (resumed) {
    state = existing
    diagLogger?.info(`[multipart] resuming ${fileName}: ${state.completedParts.length}/${state.partCount} parts done`)
    // Resume path: no initiate response in hand, so fetch fresh presigned URLs for the remaining
    // parts (the original presigns are 15-min lived and almost certainly expired by now).
    partUrls = await collectPartUrls(ctx, authClient, token, state, diagLogger)
  } else {
    const initiated = await initiate(ctx, authClient, token, buffer.length, fileName, contentType, diagLogger)
    state = initiated.session
    partUrls = initiated.partUrls
    storage.set(userId, fingerprint, state)
  }

  const completed = await runPartWorkers({
    state,
    userId,
    fingerprint,
    fileName,
    buffer,
    partUrls,
    completed: new Map(state.completedParts.map(p => [p.partNumber, p])),
    emitProgress: (r: boolean) => emitProgress(ctx, fileName, state, completedParts(state), r),
    refreshUrls: () => refreshAllUrls(ctx, authClient, token, state, partUrls, diagLogger),
    diagLogger,
    internalAbort: new AbortController(),
    authClient,
    ctx,
    token,
    resumed
  })

  state.completedParts = [...completed.values()]

  const finalUrl = await complete(ctx, authClient, token, state, fileName, img, diagLogger)
  storage.remove(userId, fingerprint)
  return finalUrl
}

const completedParts = (state: MultipartSession): MultipartCompletedPart[] => state.completedParts

/**
 * Compose the user-facing Error.message for a failed cloud round-trip.
 *
 * Preference order (highest first):
 * 1. Server-provided `message` from the response body — most specific
 *    ("File extension is not allowed: .dmg", "Storage quota exceeded for plan free", etc.);
 *    users / AI agents can act on it immediately.
 * 2. i18n key translation — fallback for cases where no server message is available
 *    (e.g. local shape-validation failures, network errors with no response body).
 *
 * Without this step every cloud failure surfaces as the generic i18n string (e.g.
 * "PicGo Cloud returned an invalid multipart upload initiate response"), forcing the caller
 * to walk the `cause` chain just to find "File extension is not allowed: .dmg".
 *
 * The diagLogger line still records the full status / code / server msg triple separately,
 * so debugging context is preserved either way.
 */
const buildUserMessage = (ctx: IPicGo, i18nKey: ILocalesKey, cause: unknown): string => {
  const serverMessage = getCloudErrorMessage(cause, '').trim()
  if (serverMessage !== '') {
    return serverMessage
  }
  return ctx.i18n.translate<ILocalesKey>(i18nKey)
}

const emitProgress = (
  ctx: IPicGo,
  fileName: string,
  state: MultipartSession,
  completed: MultipartCompletedPart[],
  resumed: boolean
): void => {
  const bytes = completed.reduce((acc, part) => {
    const start = (part.partNumber - 1) * state.partSize
    const end = Math.min(start + state.partSize, state.size)
    return acc + (end - start)
  }, 0)
  const fraction = state.size > 0 ? Math.min(bytes / state.size, 1) : 0
  const payload: IFileUploadProgress = {
    fileName,
    current: bytes,
    total: state.size,
    fraction,
    partsCompleted: completed.length,
    totalParts: state.partCount,
    resumed
  }
  ctx.emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, payload)
}

const initiate = async (
  ctx: IPicGo,
  authClient: AuthRequestClient,
  token: string,
  sizeBytes: number,
  fileName: string,
  contentType: string,
  diagLogger: ILogger | undefined
): Promise<{ session: MultipartSession; partUrls: Map<number, MultipartPartInfo> }> => {
  try {
    const resp = await authClient.request<InitiateResponse>({
      method: 'POST',
      url: '/api/upload/multipart/initiate',
      data: {
        filename: fileName,
        contentType,
        sizeBytes
      }
    }, token)

    if (!resp.success || !resp.uploadId || !resp.objectKey || !resp.publicId || !resp.url || !resp.partSize || !resp.partCount || !resp.parts) {
      throw new Error(resp.message || ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_INVALID_INITIATE_RESPONSE'))
    }

    const session: MultipartSession = {
      v: 1,
      uploadId: resp.uploadId,
      objectKey: resp.objectKey,
      publicId: resp.publicId,
      url: resp.url,
      filename: fileName,
      size: sizeBytes,
      contentType,
      partSize: resp.partSize,
      partCount: resp.partCount,
      completedParts: [],
      createdAt: Date.now()
    }
    return { session, partUrls: indexParts(resp.parts) }
  } catch (error) {
    handleAuthError(ctx, error)
    diagLogger?.error(`[multipart-initiate] status=${getCloudErrorStatus(error) ?? '?'} code=${getCloudErrorCode(error) ?? '-'} server="${getCloudErrorMessage(error)}"`)
    throw createCloudServiceError(
      buildUserMessage(ctx, 'PICGO_CLOUD_UPLOAD_INVALID_INITIATE_RESPONSE', error),
      error
    )
  }
}

const collectPartUrls = async (
  ctx: IPicGo,
  authClient: AuthRequestClient,
  token: string,
  state: MultipartSession,
  diagLogger: ILogger | undefined
): Promise<Map<number, MultipartPartInfo>> => {
  const done = new Set(state.completedParts.map(p => p.partNumber))
  const needed: number[] = []
  for (let i = 1; i <= state.partCount; i++) {
    if (!done.has(i)) needed.push(i)
  }
  if (needed.length === 0) return new Map()
  return fetchPartUrls(ctx, authClient, token, state, needed, diagLogger)
}

const fetchPartUrls = async (
  ctx: IPicGo,
  authClient: AuthRequestClient,
  token: string,
  state: MultipartSession,
  partNumbers: number[],
  diagLogger: ILogger | undefined
): Promise<Map<number, MultipartPartInfo>> => {
  try {
    const resp = await authClient.request<PartUrlsResponse>({
      method: 'POST',
      url: '/api/upload/multipart/part-urls',
      data: {
        uploadId: state.uploadId,
        objectKey: state.objectKey,
        partNumbers
      }
    }, token)
    if (!resp.success || !resp.parts) {
      throw new Error(resp.message || 'invalid part-urls response')
    }
    return indexParts(resp.parts)
  } catch (error) {
    handleAuthError(ctx, error)
    diagLogger?.error(`[multipart-part-urls] status=${getCloudErrorStatus(error) ?? '?'} code=${getCloudErrorCode(error) ?? '-'} server="${getCloudErrorMessage(error)}"`)
    throw createCloudServiceError(
      buildUserMessage(ctx, 'PICGO_CLOUD_UPLOAD_MULTIPART_PART_FAILED', error),
      error
    )
  }
}

const refreshAllUrls = async (
  ctx: IPicGo,
  authClient: AuthRequestClient,
  token: string,
  state: MultipartSession,
  partUrls: Map<number, MultipartPartInfo>,
  diagLogger: ILogger | undefined
): Promise<void> => {
  const done = new Set(state.completedParts.map(p => p.partNumber))
  const remaining: number[] = []
  for (let i = 1; i <= state.partCount; i++) {
    if (!done.has(i)) remaining.push(i)
  }
  const fresh = await fetchPartUrls(ctx, authClient, token, state, remaining, diagLogger)
  for (const [num, info] of fresh) partUrls.set(num, info)
}

const runPartWorkers = async (input: PartUploadInput): Promise<Map<number, MultipartCompletedPart>> => {
  const {
    state, userId, fingerprint, buffer, partUrls, completed,
    diagLogger, internalAbort, ctx, resumed
  } = input

  const completedNumbers = new Set(completed.keys())
  const queue: number[] = []
  for (let i = 1; i <= state.partCount; i++) {
    if (!completedNumbers.has(i)) queue.push(i)
  }

  // Always emit an initial progress event — covers the complete-only resume case where every part
  // is already done, so the CLI still sees 100% before we jump to the finalize call.
  emitProgress(ctx, input.fileName, state, [...completed.values()], resumed)

  if (queue.length === 0) return completed

  let refreshPromise: Promise<void> | null = null
  const ensureFreshUrls = async (): Promise<void> => {
    if (refreshPromise) {
      await refreshPromise
      return
    }
    refreshPromise = input.refreshUrls()
    try {
      await refreshPromise
    } finally {
      refreshPromise = null
    }
  }

  // Use an object slot rather than a plain `let`: TS narrows a `let` assigned inside an async
  // closure to `never` at the read site after Promise.all, even when typed `Error | null`.
  // The slot indirection sidesteps that control-flow limitation cleanly.
  const fatalErrorSlot: { value: Error | null } = { value: null }

  const uploadOne = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * state.partSize
    const end = Math.min(start + state.partSize, state.size)
    const slice = buffer.subarray(start, end)
    for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
      if (internalAbort.signal.aborted) throw new Error('Aborted')
      const info = partUrls.get(partNumber)
      if (!info) throw new Error(`missing presign for part ${partNumber}`)
      try {
        const etag = await putPart(ctx, info, slice, partNumber)
        const part: MultipartCompletedPart = { partNumber, etag }
        completed.set(partNumber, part)
        completedNumbers.add(partNumber)
        input.diagLogger?.info(`[multipart] part ${partNumber} done etag=${etag}`)
        // Write-through to local storage; MultipartStorage already swallows write failures
        // internally (resume is best-effort), so no try/catch needed here.
        const internals = (input.ctx.cloud.uploader as MultipartUploadService).getInternals()
        internals.storage.appendCompletedPart(userId, fingerprint, part)
        emitProgress(ctx, input.fileName, state, [...completed.values()], resumed)
        return
      } catch (error) {
        if (internalAbort.signal.aborted) throw error
        if (error instanceof PartHttpError && error.status === 403) {
          diagLogger?.info(`[multipart] part ${partNumber} presign expired (403), refreshing`)
          await ensureFreshUrls()
          continue
        }
        if (error instanceof PartHttpError && error.status === 404) {
          diagLogger?.warn(`[multipart] session ${state.uploadId} not found on server (404); clearing local entry`)
          const internals = (input.ctx.cloud.uploader as MultipartUploadService).getInternals()
          internals.storage.remove(userId, fingerprint)
          // 404 keeps the dedicated i18n key — R2 typically returns an XML error body whose
          // message isn't actionable; the i18n "session expired, please re-upload" is more
          // directive than the raw server text.
          throw createCloudServiceError(
            ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MULTIPART_NOT_FOUND'),
            error
          )
        }
        diagLogger?.warn(`[multipart] part ${partNumber} attempt ${attempt} failed: ${getCloudErrorStatus(error) ?? '?'} ${getCloudErrorMessage(error)}`)
        if (attempt < BACKOFF_DELAYS_MS.length) {
          try {
            await sleep(BACKOFF_DELAYS_MS[attempt], internalAbort.signal)
          } catch {
            throw error
          }
          continue
        }
        diagLogger?.error(`[multipart-part] part ${partNumber} failed after retries: status=${getCloudErrorStatus(error) ?? '?'} server="${getCloudErrorMessage(error)}"`)
        // R2 returns XML on part PUT failures; the raw message is not actionable, so stick
        // to the i18n key here. buildUserMessage is reserved for PicGo Cloud business API calls
        // (initiate / part-urls / complete) where the JSON `message` field is user-grade.
        throw createCloudServiceError(
          ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MULTIPART_PART_FAILED'),
          error
        )
      }
    }
    throw createCloudServiceError(
      ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MULTIPART_PART_FAILED'),
      new Error('exhausted attempts')
    )
  }

  const workers: Array<Promise<void>> = []
  const workerCount = Math.min(CONCURRENCY, queue.length)
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (queue.length > 0) {
        if (internalAbort.signal.aborted) return
        const next = queue.shift()
        if (next === undefined) return
        try {
          await uploadOne(next)
        } catch (error) {
          if (fatalErrorSlot.value === null && !isAbortError(error)) {
            fatalErrorSlot.value = error instanceof Error ? error : new Error(String(error))
          }
          internalAbort.abort()
          return
        }
      }
    })())
  }

  await Promise.all(workers)
  const fatalError = fatalErrorSlot.value
  if (fatalError !== null) {
    throw fatalError
  }
  return completed
}

const isAbortError = (error: unknown): boolean => {
  return error instanceof Error && error.message === 'Aborted'
}

const putPart = async (
  ctx: IPicGo,
  info: MultipartPartInfo,
  body: Buffer,
  partNumber: number
): Promise<string> => {
  try {
    const config: AxiosRequestConfig = {
      method: info.method,
      url: info.url,
      data: body,
      headers: info.headers ?? {},
      resolveWithFullResponse: true,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    } as AxiosRequestConfig
    const response = await ctx.request<{ headers: Record<string, string> }, IReqOptions<Buffer>>(config as unknown as IReqOptions<Buffer>)
    const headers = response.headers ?? {}
    const etag = headers.etag ?? headers.ETag ?? (headers as Record<string, string>).Etag
    if (!etag) {
      throw new Error(`part ${partNumber} response missing ETag header`)
    }
    return etag
  } catch (error) {
    const status = getCloudErrorStatus(error)
    if (typeof status === 'number') {
      throw new PartHttpError(`part ${partNumber} HTTP ${status}`, status)
    }
    throw error
  }
}

const complete = async (
  ctx: IPicGo,
  authClient: AuthRequestClient,
  token: string,
  state: MultipartSession,
  fileName: string,
  img: IImgInfo,
  diagLogger: ILogger | undefined
): Promise<FileUploadResult> => {
  if (state.completedParts.length !== state.partCount) {
    throw createCloudServiceError(
      ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MULTIPART_COMPLETE_FAILED'),
      new Error('part count mismatch at complete')
    )
  }
  const parts = [...state.completedParts].sort((a, b) => a.partNumber - b.partNumber)

  try {
    await authClient.request<CompleteResponse>({
      method: 'POST',
      url: '/api/upload/multipart/complete',
      data: {
        uploadId: state.uploadId,
        objectKey: state.objectKey,
        parts
      }
    }, token)
  } catch (error) {
    handleAuthError(ctx, error)
    diagLogger?.error(`[multipart-complete] status=${getCloudErrorStatus(error) ?? '?'} code=${getCloudErrorCode(error) ?? '-'} server="${getCloudErrorMessage(error)}"`)
    throw createCloudServiceError(
      buildUserMessage(ctx, 'PICGO_CLOUD_UPLOAD_MULTIPART_COMPLETE_FAILED', error),
      error
    )
  }

  // Mirror the single-PUT path: after multipart finalize, also call /api/album-items/complete
  // to finalize on the PicGo Cloud business side (album record creation, returning final imgUrl).
  try {
    const resp = await authClient.request<CompleteResponse>({
      method: 'POST',
      url: '/api/album-items/complete',
      data: {
        objectKey: state.objectKey,
        publicId: state.publicId,
        filename: fileName,
        ...(typeof img.width === 'number' ? { width: img.width } : {}),
        ...(typeof img.height === 'number' ? { height: img.height } : {})
      }
    }, token)

    const item = resp.data?.item
    const finalUrl = item?.imgUrl
    if (!resp.success || typeof finalUrl !== 'string' || finalUrl.length === 0) {
      throw new Error(resp.message || 'invalid album-items complete response')
    }
    return {
      imgUrl: finalUrl,
      ...(typeof item?.width === 'number' ? { width: item.width } : {}),
      ...(typeof item?.height === 'number' ? { height: item.height } : {}),
      ...(typeof item?.size === 'number' ? { size: item.size } : {}),
      ...(typeof item?.contentType === 'string' ? { contentType: item.contentType } : {})
    }
  } catch (error) {
    handleAuthError(ctx, error)
    diagLogger?.error(`[album-items-complete] status=${getCloudErrorStatus(error) ?? '?'} code=${getCloudErrorCode(error) ?? '-'} server="${getCloudErrorMessage(error)}"`)
    throw createCloudServiceError(
      buildUserMessage(ctx, 'PICGO_CLOUD_UPLOAD_INVALID_COMPLETE_RESPONSE', error),
      error
    )
  }
}

/** 401 → clear token and throw relogin error. Mirrors FileService.callAuthenticatedStep behaviour. */
const handleAuthError = (ctx: IPicGo, error: unknown): void => {
  if (!axios.isAxiosError(error)) return
  const status = getCloudErrorStatus(error)
  if (status !== 401) return
  ctx.removeConfig('settings.picgoCloud', 'token')
  throw createCloudServiceError(
    ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_RELOGIN_REQUIRED'),
    error
  )
}
