import type { ILocalesKey } from '../../i18n/zh-CN'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { IBuildInEvent } from '../../utils/enum'
import type { IImgInfo, IPluginConfig, IPicGo } from '../../types'
import { ApiErrorCode } from '../../lib/Cloud/ApiErrorCode'
import { getCloudErrorCode, getCloudErrorMessage, getCloudErrorStatus } from '../../lib/Cloud/Request'
import { FileService } from '../../lib/Cloud/services/FileService'
import { PICGO_CLOUD, PICGO_CLOUD_AUTO_IMPORT_PLUGIN, PICGO_CLOUD_IMPORT_LOG_FILE } from '../../utils/static'

interface IAutoImportLogEntry {
  source: 'upload'
  timestamp: string
  status: 'success' | 'partial' | 'failed' | 'skipped'
  itemCount: number
  reason?: 'missing_token' | 'no_eligible_items' | 'auto_import_disabled'
  result?: {
    total: number
    created: number
    skipped: number
    invalid: number
    failed: number
    pending: number
  }
  retryPending?: {
    total: number
    created: number
    skipped: number
    invalid: number
    failed: number
    pending: number
  }
  error?: {
    message: string
    status?: number
    code?: string
  }
}

const getAlbumImportItems = (items: IImgInfo[]): IImgInfo[] => {
  return items.filter(item => item.type !== PICGO_CLOUD)
}

const getAutoImportLogPath = (ctx: IPicGo): string => {
  return join(ctx.baseDir, PICGO_CLOUD_IMPORT_LOG_FILE)
}

const summarizeImportResult = (result: {
  total: number
  created: number
  skipped: number
  invalid: number
  failed: number
  pending: number
}): IAutoImportLogEntry['result'] => {
  return {
    total: result.total,
    created: result.created,
    skipped: result.skipped,
    invalid: result.invalid,
    failed: result.failed,
    pending: result.pending
  }
}

const writeAutoImportLog = async (
  ctx: IPicGo,
  entry: Omit<IAutoImportLogEntry, 'source' | 'timestamp'>
): Promise<void> => {
  const payload: IAutoImportLogEntry = {
    ...entry,
    source: 'upload',
    timestamp: new Date().toISOString()
  }
  const importLogger = ctx.log.createLogger?.({
    logPath: getAutoImportLogPath(ctx),
    consoleOutput: false,
    respectSilent: false
  })

  importLogger?.info(JSON.stringify(payload))
}

const config = (): IPluginConfig[] => []

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const fileService = new FileService(ctx)

  for (const img of ctx.output) {
    try {
      const result = await fileService.upload(img)
      delete img.base64Image
      delete img.buffer
      img.imgUrl = result.imgUrl
      if (result.width !== undefined) img.width = result.width
      if (result.height !== undefined) img.height = result.height
      if (result.size !== undefined) img.size = result.size
      if (result.contentType !== undefined) img.contentType = result.contentType
    } catch (error: unknown) {
      if (error instanceof Error) {
        ctx.log.error(error)
        throw error
      }

      throw new Error(ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'))
    }
  }

  return ctx
}

const prefetchCloudUserInfo = (ctx: IPicGo): void => {
  const token = ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
  if (!token) {
    return
  }

  ctx.cloud.getUserInfo().catch(() => {})
}

const ensureOutputItemIds = (items: IImgInfo[]): void => {
  for (const item of items) {
    if (typeof item.id === 'string' && item.id.trim() !== '') {
      continue
    }

    item.id = randomUUID()
  }
}

const shouldRunAutoImportInBackground = (ctx: IPicGo): boolean => {
  const isGui = typeof ctx.GUI_VERSION === 'string' && ctx.GUI_VERSION.trim() !== ''
  const isServerMode = ctx.getConfig<boolean | undefined>('picgoInternal.serverMode') === true
  return isGui || isServerMode
}

const hasPicGoCloudItems = (items: IImgInfo[]): boolean => {
  return items.some(item => item.type === PICGO_CLOUD)
}

const handleAutoImport = async (ctx: IPicGo): Promise<void> => {
  const token = ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
  const importItems = getAlbumImportItems(ctx.output)
  if (!token || importItems.length === 0) {
    // PicGo Cloud uploads are already in the cloud album via the upload flow,
    // so we still need to notify the GUI to refresh the cloud gallery.
    if (hasPicGoCloudItems(ctx.output)) {
      ctx.emit(IBuildInEvent.CLOUD_ALBUM_UPDATED, { items: [] })
    }
    await writeAutoImportLog(ctx, {
      status: 'skipped',
      itemCount: importItems.length,
      reason: token ? 'no_eligible_items' : 'missing_token'
    })
    return
  }

  try {
    const userInfo = await ctx.cloud.getUserInfo()
    if (!userInfo?.autoImport) {
      await writeAutoImportLog(ctx, {
        status: 'skipped',
        itemCount: importItems.length,
        reason: 'auto_import_disabled'
      })
      return
    }

    ensureOutputItemIds(importItems)
    const importResult = await ctx.cloud.album.import(importItems)
    if (importResult.failed > 0) {
      await writeAutoImportLog(ctx, {
        status: 'partial',
        itemCount: importItems.length,
        result: summarizeImportResult(importResult)
      })
      ctx.emit(IBuildInEvent.CLOUD_ALBUM_UPDATED, { items: importResult.items })
      return
    }

    const retryPendingResult = await ctx.cloud.album.retryPending()
    await writeAutoImportLog(ctx, {
      status: 'success',
      itemCount: importItems.length,
      result: summarizeImportResult(importResult),
      retryPending: summarizeImportResult(retryPendingResult)
    })
    const allImportedItems = [...importResult.items, ...retryPendingResult.items]
    ctx.emit(IBuildInEvent.CLOUD_ALBUM_UPDATED, { items: allImportedItems })
  } catch (error: unknown) {
    const errorMessage = getCloudErrorMessage(error)
    const status = getCloudErrorStatus(error)
    const code = getCloudErrorCode(error)
    const shouldSkipPending = status === 401 ||
      status === 403 ||
      code === ApiErrorCode.DuplicateId

    if (!shouldSkipPending) {
      try {
        await ctx.cloud.album.addToPending(importItems)
      } catch {}
    }

    await writeAutoImportLog(ctx, {
      status: 'failed',
      itemCount: importItems.length,
      error: {
        message: errorMessage,
        ...(typeof status === 'number' ? { status } : {}),
        ...(typeof code === 'string' ? { code } : {})
      }
    })
  }
}

const startBackgroundTask = (taskFactory: () => Promise<void>): void => {
  const task = taskFactory()
  task.catch(() => {})
}

const handleBeforeUploadEvent = (uploadCtx: IPicGo): void => {
  prefetchCloudUserInfo(uploadCtx)
}

const handleAfterUploadEvent = (uploadCtx: IPicGo): void => {
  if (!shouldRunAutoImportInBackground(uploadCtx)) {
    return
  }

  setImmediate(() => {
    startBackgroundTask(() => handleAutoImport(uploadCtx))
  })
}

const handleAutoImportForCli = async (ctx: IPicGo): Promise<void> => {
  if (!shouldRunAutoImportInBackground(ctx)) {
    await handleAutoImport(ctx)
  }
}

function registerPicGoCloudUploader (ctx: IPicGo): void {
  ctx.helper.uploader.register(PICGO_CLOUD, {
    name: 'PicGo Cloud',
    handle,
    config
  })
  ctx.on(IBuildInEvent.BEFORE_UPLOAD, handleBeforeUploadEvent)
  ctx.on(IBuildInEvent.AFTER_UPLOAD, handleAfterUploadEvent)
  ctx.helper.afterFinishPlugins.register(PICGO_CLOUD_AUTO_IMPORT_PLUGIN, {
    handle: handleAutoImportForCli
  })
}

export { registerPicGoCloudUploader }
