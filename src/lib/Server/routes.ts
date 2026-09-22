import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import path from 'path'
import type { Hono } from 'hono'
import type { IImgInfo, IPicGo, UploadOptions, UploadSelection } from '../../types'
import type { IServerUploadAdapter } from '../../types/internal'
import { BuiltinRoutePath } from '../Routes/routePath'
import type { ILocalesKey } from '../../i18n/zh-CN'
import { resolveUploadOptions, UploadSelectionError, UploadSelectionErrorCode } from '../UploadSelection'

type FormDataFileLike = {
  name?: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

const getErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

type ParsedUploadRequestBody =
  | { kind: ParsedUploadRequestBodyKind.Clipboard }
  | { kind: ParsedUploadRequestBodyKind.List; list: string[] }
  | { kind: ParsedUploadRequestBodyKind.Invalid; messageKey: ILocalesKey }

enum ParsedUploadRequestBodyKind {
  Clipboard,
  List,
  Invalid
}

const parseUploadRequestBody = (value: unknown): ParsedUploadRequestBody => {
  if (typeof value !== 'object' || value === null) {
    return { kind: ParsedUploadRequestBodyKind.Invalid, messageKey: 'SERVER_INVALID_REQUEST_BODY_LIST_REQUIRED' }
  }

  if (!('list' in value)) {
    // GUI compatibility: JSON without list -> upload from clipboard.
    return { kind: ParsedUploadRequestBodyKind.Clipboard }
  }

  const list = (value as { list?: unknown }).list
  if (list === undefined) {
    return { kind: ParsedUploadRequestBodyKind.Clipboard }
  }

  if (!Array.isArray(list)) {
    return { kind: ParsedUploadRequestBodyKind.Invalid, messageKey: 'SERVER_INVALID_REQUEST_BODY_LIST_REQUIRED' }
  }

  if (list.length === 0) {
    // GUI compatibility: empty list -> upload from clipboard.
    return { kind: ParsedUploadRequestBodyKind.Clipboard }
  }

  const valid = list.every((item) => typeof item === 'string' && item.trim() !== '')
  if (!valid) {
    return { kind: ParsedUploadRequestBodyKind.Invalid, messageKey: 'SERVER_INVALID_REQUEST_BODY_LIST_REQUIRED' }
  }

  return { kind: ParsedUploadRequestBodyKind.List, list: list as string[] }
}

const isFormDataFileLike = (value: unknown): value is FormDataFileLike => {
  if (typeof value !== 'object' || value === null) return false
  if (!('arrayBuffer' in value)) return false
  return typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
}

const getFormDataFileName = (value: FormDataFileLike): string => {
  const name = value.name
  if (typeof name === 'string' && name.trim() !== '') return name
  return `${randomUUID()}.png`
}

interface UploadResultItem {
  origin?: string
  imgUrl?: string
  fileName?: string
  type?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  extname?: string
}

interface UploadResponse {
  success: boolean
  result: string[]
  items: UploadResultItem[]
  code?: UploadSelectionErrorCode
  message?: string
}

type GetUploadAdapter = () => IServerUploadAdapter | undefined

const createDefaultUploadAdapter = (ctx: IPicGo): IServerUploadAdapter => ({
  uploadClipboard: async (options?: UploadOptions) => options === undefined ? await ctx.upload() : await ctx.upload(undefined, options),
  uploadPaths: async (paths: string[], options?: UploadOptions) => options === undefined ? await ctx.upload(paths) : await ctx.upload(paths, options),
  getTempDir: () => path.join(ctx.baseDir, 'picgo-form-images')
})

const buildUploadResponse = (output: IImgInfo[] | Error): UploadResponse => {
  if (output instanceof UploadSelectionError) {
    return { success: false, result: [], items: [], code: output.code, message: output.message }
  }

  if (output instanceof Error) {
    return { success: false, result: [], items: [], message: output.message }
  }

  const result = output
    .map(item => item.imgUrl)
    .filter((url): url is string => typeof url === 'string' && url !== '')

  const items: UploadResultItem[] = output.map(item => ({
    origin: item.origin,
    imgUrl: item.imgUrl,
    fileName: item.fileName,
    type: item.type,
    contentType: item.contentType,
    size: item.size,
    width: item.width,
    height: item.height,
    extname: item.extname
  }))

  if (result.length === 0) {
    return { success: false, result, items, message: 'All uploads failed' }
  }

  return { success: true, result, items }
}

const getUploadResponseStatus = (response: UploadResponse): 200 | 400 | 500 => {
  if (response.success) return 200
  if (response.code !== undefined) return 400
  return 500
}

const buildSelectionErrorResponse = (error: UploadSelectionError): UploadResponse => ({
  success: false,
  result: [],
  items: [],
  code: error.code,
  message: error.message
})

const selectionParameterNames = ['uploader', 'configName', 'configId'] as const

const parseUploadSelection = (
  url: URL,
  translate: <T extends ILocalesKey>(key: T, args?: Record<string, string>) => string
): UploadSelection | undefined => {
  const selection: UploadSelection = {}
  let hasSelection = false

  for (const parameter of selectionParameterNames) {
    const values = url.searchParams.getAll(parameter)
    if (values.length === 0) continue
    if (values.length !== 1 || values[0].trim() === '') {
      throw new UploadSelectionError(
        UploadSelectionErrorCode.InvalidSelection,
        translate('UPLOAD_SELECTION_INVALID_PARAMETER', { parameter })
      )
    }
    selection[parameter] = values[0]
    hasSelection = true
  }

  return hasSelection ? selection : undefined
}

const registerCoreRoutes = (app: Hono<any, any, any>, ctx: IPicGo, getUploadAdapter?: GetUploadAdapter): void => {
  app.post(BuiltinRoutePath.UPLOAD, async (c) => {
    const t = <T extends ILocalesKey>(key: T, args?: Record<string, string>): string => {
      return ctx.i18n?.translate<T>(key, args) ?? String(key)
    }

    try {
      const uploadOptions = parseUploadSelection(new URL(c.req.url), t)
      resolveUploadOptions(ctx, uploadOptions)

      const contentType = c.req.raw.headers.get('content-type') || ''
      const uploadAdapter = getUploadAdapter?.() ?? createDefaultUploadAdapter(ctx)

      if (contentType.includes('multipart/form-data')) {
        const tempParentDir = uploadAdapter.getTempDir?.() ?? path.join(ctx.baseDir, 'picgo-form-images')
        const requestTempDir = path.join(tempParentDir, randomUUID())
        const tempFiles: string[] = []
        try {
          const formData = await c.req.formData()
          const files = formData.getAll('files') as unknown[]
          if (files.length === 0) {
            return c.json({ success: false, result: [], items: [], message: t('SERVER_FORMDATA_NO_FILES_IN_FILES_FIELD') }, 400)
          }

          for (const file of files) {
            if (!isFormDataFileLike(file)) {
              return c.json({ success: false, result: [], items: [], message: t('SERVER_FORMDATA_FILES_MUST_BE_FILES') }, 400)
            }

            const fileName = getFormDataFileName(file)
            const safeName = path.basename(fileName)
            const filePath = path.join(requestTempDir, randomUUID(), safeName)
            const buffer = Buffer.from(await file.arrayBuffer())
            await fs.ensureDir(path.dirname(filePath))
            await fs.writeFile(filePath, buffer)
            tempFiles.push(filePath)
          }

          const output = uploadOptions === undefined
            ? await uploadAdapter.uploadPaths(tempFiles)
            : await uploadAdapter.uploadPaths(tempFiles, uploadOptions)
          const response = buildUploadResponse(output)
          return c.json(response, getUploadResponseStatus(response))
        } catch (e: unknown) {
          if (e instanceof UploadSelectionError) {
            return c.json(buildSelectionErrorResponse(e), 400)
          }
          ctx.log.error(e)
          return c.json({ success: false, result: [], items: [], message: getErrorMessage(e) }, 500)
        } finally {
          try {
            await fs.remove(requestTempDir)
          } catch (cleanupError: unknown) {
            ctx.log.error(cleanupError)
          }
        }
      }

      const bodyText = await c.req.raw.text().catch(() => '')

      // No request body -> upload from clipboard.
      if (bodyText.trim() === '') {
        const output = uploadOptions === undefined
          ? await uploadAdapter.uploadClipboard()
          : await uploadAdapter.uploadClipboard(uploadOptions)
        const response = buildUploadResponse(output)
        return c.json(response, getUploadResponseStatus(response))
      }

      let body: unknown
      try {
        body = JSON.parse(bodyText)
      } catch {
        return c.json({ success: false, result: [], items: [], message: t('SERVER_INVALID_JSON_BODY') }, 400)
      }

      const parsedBody = parseUploadRequestBody(body)
      if (parsedBody.kind === ParsedUploadRequestBodyKind.Invalid) {
        return c.json({ success: false, result: [], items: [], message: t(parsedBody.messageKey) }, 400)
      }

      if (parsedBody.kind === ParsedUploadRequestBodyKind.Clipboard) {
        const output = uploadOptions === undefined
          ? await uploadAdapter.uploadClipboard()
          : await uploadAdapter.uploadClipboard(uploadOptions)
        const response = buildUploadResponse(output)
        return c.json(response, getUploadResponseStatus(response))
      }

      const output = uploadOptions === undefined
        ? await uploadAdapter.uploadPaths(parsedBody.list)
        : await uploadAdapter.uploadPaths(parsedBody.list, uploadOptions)
      const response = buildUploadResponse(output)
      return c.json(response, getUploadResponseStatus(response))
    } catch (e: unknown) {
      if (e instanceof UploadSelectionError) {
        return c.json(buildSelectionErrorResponse(e), 400)
      }
      ctx.log.error(e)
      return c.json({ success: false, result: [], items: [], message: getErrorMessage(e) }, 500)
    }
  })

  app.post(BuiltinRoutePath.HEARTBEAT, (c) => {
    return c.json({ success: true, result: 'alive' })
  })
}

export { registerCoreRoutes }
