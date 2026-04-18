import mime from 'mime-types'
import axios from 'axios'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type {
  AlbumFiltersResponse,
  AlbumListQuery,
  AlbumListResponse,
  CloudImportProgress,
  IImgInfo,
  ImportResult,
  IPicGo
} from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { IBuildInEvent } from '../../../utils/enum'
import { PICGO_CLOUD_IMPORT_PENDING_FILE } from '../../../utils/static'
import { ApiErrorCode } from '../ApiErrorCode'
import {
  AuthRequestClient,
  createCloudServiceError,
  getCloudErrorCode,
  getCloudErrorMessage,
  getCloudErrorStatus
} from '../Request'
import {
  chunkArray,
  compactDefinedRecord,
  isRecord,
  toNonNegativeInteger,
  toUnixMilliseconds
} from '../utils'

interface IAlbumImportBatchResponse {
  success?: boolean
  data?: {
    created?: number
    skipped?: number
    items?: IImgInfo[]
  }
}

interface IAlbumItemSingleResponse {
  success: boolean
  data: {
    item: IImgInfo
  }
}

interface IAlbumItemDeleteResponse {
  success: boolean
  data: {
    message?: string
    deleted?: number
  }
}

interface IAlbumListApiResponse {
  success: boolean
  data: {
    items: IImgInfo[]
    total: number
    limit: number
    offset: number
  }
}

interface IAlbumFiltersApiResponse {
  success: boolean
  data: {
    contentTypes: string[]
    exts: string[]
  }
}

interface INormalizedImportItem extends IImgInfo {
  id: string
  imgUrl: string
  createdAt?: number
  updatedAt?: number
}

interface IImportBatchSuccess {
  ok: true
  created: number
  skipped: number
  items: IImgInfo[]
}

interface IImportBatchFailure {
  ok: false
  error: unknown
}

type IImportBatchResult = IImportBatchSuccess | IImportBatchFailure

export class AlbumService {
  private static readonly DEFAULT_LIMIT = 20
  private static readonly DEFAULT_OFFSET = 0
  private static readonly IMPORT_BATCH_SIZE = 100
  private static readonly MAX_IMPORT_ATTEMPTS = 3

  private readonly ctx: IPicGo
  private readonly client: AuthRequestClient
  private readonly pendingFilePath: string

  constructor (ctx: IPicGo, client: AuthRequestClient = new AuthRequestClient(ctx)) {
    this.ctx = ctx
    this.client = client
    this.pendingFilePath = join(ctx.baseDir, PICGO_CLOUD_IMPORT_PENDING_FILE)
  }

  async list (query: AlbumListQuery = {}): Promise<AlbumListResponse> {
    const { type, ...rest } = {
      limit: AlbumService.DEFAULT_LIMIT,
      offset: AlbumService.DEFAULT_OFFSET,
      ...query
    }
    const params = compactDefinedRecord({
      ...rest,
      contentType: rest.contentType ?? type
    })

    const response = await this.client.request<IAlbumListApiResponse>({
      method: 'GET',
      url: '/api/album-items',
      params
    })

    return {
      success: response.success,
      ...response.data
    }
  }

  async get (id: string): Promise<IImgInfo> {
    const response = await this.client.request<IAlbumItemSingleResponse>({
      method: 'GET',
      url: `/api/album-items/${id}`
    })

    return response.data.item
  }

  async update (id: string, data: Partial<IImgInfo>): Promise<IImgInfo> {
    const { extname, size, ...safeData } = data
    const response = await this.client.request<IAlbumItemSingleResponse>({
      method: 'PATCH',
      url: `/api/album-items/${id}`,
      data: safeData
    })

    return response.data.item
  }

  async delete (id: string | string[]): Promise<void> {
    if (Array.isArray(id)) {
      if (id.length === 0) {
        return
      }

      await this.client.request<IAlbumItemDeleteResponse>({
        method: 'DELETE',
        url: '/api/album-items',
        data: {
          ids: id
        }
      })

      return
    }

    await this.client.request<IAlbumItemDeleteResponse>({
      method: 'DELETE',
      url: `/api/album-items/${id}`
    })
  }

  async getFilters (): Promise<AlbumFiltersResponse> {
    const response = await this.client.request<IAlbumFiltersApiResponse>({
      method: 'GET',
      url: '/api/album-items/filters'
    })

    return {
      success: response.success,
      ...response.data
    }
  }

  async import (items: IImgInfo[]): Promise<ImportResult> {
    const existingPending = await this.getPending()
    const result: ImportResult = {
      total: items.length,
      created: 0,
      skipped: 0,
      invalid: 0,
      failed: 0,
      pending: existingPending.length,
      items: []
    }

    const normalizedItems = this.normalizeImportItems(items)
    result.invalid = items.length - normalizedItems.length

    if (normalizedItems.length === 0) {
      return result
    }

    const batches = chunkArray(normalizedItems, AlbumService.IMPORT_BATCH_SIZE)
    let current = 0

    for (const [batchOffset, batch] of batches.entries()) {
      const batchResult = await this.importBatchWithRetry(batch)

      if (!batchResult.ok) {
        result.failed += batch.length
        current += batch.length

        const remainingItems = batches.slice(batchOffset).flat()
        const pendingItems = await this.addToPending(remainingItems)
        result.pending = pendingItems.length

        this.emitImportProgress({
          total: normalizedItems.length,
          current,
          batchIndex: batchOffset + 1,
          batchTotal: batches.length,
          created: result.created,
          skipped: result.skipped,
          failed: result.failed
        })

        this.ctx.log.warn(getCloudErrorMessage(batchResult.error))
        return result
      }

      result.created += batchResult.created
      result.skipped += batchResult.skipped
      result.items.push(...batchResult.items)
      current += batch.length

      this.emitImportProgress({
        total: normalizedItems.length,
        current,
        batchIndex: batchOffset + 1,
        batchTotal: batches.length,
        created: result.created,
        skipped: result.skipped,
        failed: result.failed
      })
    }

    result.pending = (await this.getPending()).length
    return result
  }

  async getPending (): Promise<IImgInfo[]> {
    try {
      const content = await readFile(this.pendingFilePath, 'utf8')
      const parsed = JSON.parse(content) as unknown

      if (!Array.isArray(parsed)) {
        this.warnInvalidPendingFile()
        return []
      }

      return parsed.filter((item) => this.isImgInfoLike(item))
    } catch (error: unknown) {
      if (this.isFileMissing(error)) {
        return []
      }

      if (error instanceof SyntaxError) {
        this.warnInvalidPendingFile()
        return []
      }

      throw error
    }
  }

  async addToPending (items: IImgInfo[]): Promise<IImgInfo[]> {
    if (items.length === 0) {
      return await this.getPending()
    }

    const pendingItems = await this.getPending()
    const nextPendingItems = [...pendingItems, ...items]
    await this.writePending(nextPendingItems)
    return nextPendingItems
  }

  async retryPending (): Promise<ImportResult> {
    const pendingItems = await this.getPending()
    if (pendingItems.length === 0) {
      return {
        total: 0,
        created: 0,
        skipped: 0,
        invalid: 0,
        failed: 0,
        pending: 0,
        items: []
      }
    }

    await this.writePending([])

    try {
      return await this.import(pendingItems)
    } catch (error) {
      await this.writePending(pendingItems)
      throw error
    }
  }

  private normalizeImportItems (items: IImgInfo[]): INormalizedImportItem[] {
    return items.flatMap((item) => {
      const imgUrl = typeof item.imgUrl === 'string' ? item.imgUrl.trim() : ''
      if (imgUrl === '') {
        return []
      }

      const id = typeof item.id === 'string' && item.id.trim() !== ''
        ? item.id.trim()
        : randomUUID()
      const contentType = this.resolveContentType(item)
      const {
        mimeType, createdAt, updatedAt,
        // Strip internal/local-only fields that should not be sent to the cloud
        origin, filePath, buffer, base64Image, _importToPicGoCloud,
        ...rest
      } = item
      const createdAtTimestamp = toUnixMilliseconds(createdAt)
      const updatedAtTimestamp = toUnixMilliseconds(updatedAt)
      const extra = this.buildExtra(item)

      return [{
        ...rest,
        id,
        imgUrl,
        ...(contentType ? { contentType } : {}),
        ...(createdAtTimestamp !== undefined ? { createdAt: createdAtTimestamp } : {}),
        ...(updatedAtTimestamp !== undefined ? { updatedAt: updatedAtTimestamp } : {}),
        ...(extra ? { extra } : {})
      }]
    })
  }

  private async importBatchWithRetry (items: INormalizedImportItem[]): Promise<IImportBatchResult> {
    let lastError: unknown

    for (let attempt = 0; attempt < AlbumService.MAX_IMPORT_ATTEMPTS; attempt++) {
      try {
        const response = await this.client.request<IAlbumImportBatchResponse>({
          method: 'POST',
          url: '/api/album-items',
          data: {
            items
          }
        })

        const summary = this.normalizeBatchSummary(response, items.length)
        return {
          ok: true,
          ...summary,
          items: Array.isArray(response.data?.items) ? response.data.items : []
        }
      } catch (error: unknown) {
        if (this.hasApiErrorCode(error, ApiErrorCode.DuplicateId)) {
          throw createCloudServiceError(
            this.ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_DUPLICATE_ID'),
            error
          )
        }

        if (this.hasApiErrorCode(error, ApiErrorCode.ImportDisabled)) {
          throw createCloudServiceError(
            this.ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_AUTO_IMPORT_DISABLED'),
            error
          )
        }

        if (this.isUnauthorizedError(error)) {
          throw createCloudServiceError(
            this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_RELOGIN_REQUIRED'),
            error
          )
        }

        if (this.hasApiErrorCode(error, ApiErrorCode.PlanRequired)) {
          throw createCloudServiceError(getCloudErrorMessage(error), error)
        }

        if (!this.shouldRetry(error)) {
          throw error
        }

        lastError = error
      }
    }

    return {
      ok: false,
      error: lastError
    }
  }

  private normalizeBatchSummary (response: IAlbumImportBatchResponse, batchSize: number): Pick<IImportBatchSuccess, 'created' | 'skipped'> {
    const createdCandidate = response.data?.created
    const skippedCandidate = response.data?.skipped

    if (createdCandidate === undefined && skippedCandidate === undefined) {
      return {
        created: batchSize,
        skipped: 0
      }
    }

    let created = toNonNegativeInteger(createdCandidate, 0)
    let skipped = toNonNegativeInteger(skippedCandidate, 0)
    const overflow = created + skipped - batchSize

    if (overflow > 0) {
      if (skipped >= overflow) {
        skipped -= overflow
      } else {
        created = Math.max(0, created - (overflow - skipped))
        skipped = 0
      }
    }

    if (created === 0 && skipped === 0) {
      created = batchSize
    }

    return {
      created,
      skipped
    }
  }

  private resolveContentType (item: IImgInfo): string | undefined {
    const contentType = item.contentType?.trim() || item.mimeType?.trim()
    if (contentType && contentType !== '') {
      return contentType
    }
    // Fallback: infer from extname for historical data that lacks contentType/mimeType
    const extname = item.extname?.trim()
    if (extname) {
      return mime.lookup(extname) || undefined
    }
    return undefined
  }

  private buildExtra (item: IImgInfo): Record<string, unknown> | undefined {
    const existing = typeof item.extra === 'object' && item.extra !== null
      ? item.extra as Record<string, unknown>
      : {}
    const origin = typeof item.origin === 'string' && item.origin.trim() !== '' ? item.origin.trim() : undefined
    const extra: Record<string, unknown> = {
      ...existing,
      ...(origin ? { origin } : {})
    }
    return Object.keys(extra).length > 0 ? extra : undefined
  }

  private emitImportProgress (progress: CloudImportProgress): void {
    this.ctx.emit(IBuildInEvent.CLOUD_IMPORT_PROGRESS, progress)
  }

  private shouldRetry (error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = getCloudErrorStatus(error)
      return status === undefined || status >= 500
    }

    return true
  }

  private isUnauthorizedError (error: unknown): boolean {
    return getCloudErrorStatus(error) === 401
  }

  private hasApiErrorCode (error: unknown, code: ApiErrorCode): boolean {
    return getCloudErrorCode(error) === code
  }

  private async writePending (items: IImgInfo[]): Promise<void> {
    await writeFileAtomic(this.pendingFilePath, `${JSON.stringify(items, null, 2)}\n`, {
      encoding: 'utf8'
    })
  }

  private warnInvalidPendingFile (): void {
    this.ctx.log.warn(this.ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_PENDING_INVALID_FILE', {
      path: this.pendingFilePath
    }))
  }

  private isFileMissing (error: unknown): boolean {
    return isRecord(error) && error.code === 'ENOENT'
  }

  private isImgInfoLike (value: unknown): value is IImgInfo {
    return isRecord(value) &&
      typeof value.id === 'string' &&
      value.id.trim() !== '' &&
      typeof value.imgUrl === 'string' &&
      value.imgUrl.trim() !== ''
  }
}
