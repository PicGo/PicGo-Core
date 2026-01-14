import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import path from 'path'
import type { Hono } from 'hono'
import type { IPicGo } from '../../types'
import { BuiltinRoutePath } from '../Routes/routePath'
import type { ILocalesKey } from '../../i18n/zh-CN'

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

const registerCoreRoutes = (app: Hono<any, any, any>, ctx: IPicGo): void => {
  app.post(BuiltinRoutePath.UPLOAD, async (c) => {
    try {
      const contentType = c.req.raw.headers.get('content-type') || ''
      const t = <T extends ILocalesKey>(key: T, args?: Record<string, string>): string => {
        return ctx.i18n?.translate<T>(key, args) ?? String(key)
      }

      if (contentType.includes('multipart/form-data')) {
        const tempDir = path.join(ctx.baseDir, 'picgo-form-images')
        const tempFiles: string[] = []
        try {
          await fs.ensureDir(tempDir)
          const formData = await c.req.formData()
          const files = formData.getAll('files') as unknown[]
          if (files.length === 0) {
            return c.json({ success: false, result: [], message: t('SERVER_FORMDATA_NO_FILES_IN_FILES_FIELD') }, 400)
          }

          for (const file of files) {
            if (!isFormDataFileLike(file)) {
              return c.json({ success: false, result: [], message: t('SERVER_FORMDATA_FILES_MUST_BE_FILES') }, 400)
            }

            const fileName = getFormDataFileName(file)
            const safeName = path.basename(fileName)
            const filePath = path.join(tempDir, safeName)
            const buffer = Buffer.from(await file.arrayBuffer())
            await fs.writeFile(filePath, buffer)
            tempFiles.push(filePath)
          }

          const result = await ctx.upload(tempFiles)
          if (result instanceof Error) {
            return c.json({ success: false, result: [], message: result.message }, 500)
          }
          const urls = result
            .map(item => item.imgUrl)
            .filter((url): url is string => typeof url === 'string' && url !== '')
          return c.json({ success: true, result: urls })
        } catch (e: unknown) {
          ctx.log.error(e)
          return c.json({ success: false, result: [], message: getErrorMessage(e) }, 500)
        } finally {
          await Promise.allSettled(tempFiles.map(file => fs.remove(file)))
        }
      }

      const bodyText = await c.req.raw.text().catch(() => '')

      // No request body -> upload from clipboard.
      if (bodyText.trim() === '') {
        const result = await ctx.upload()
        if (result instanceof Error) {
          return c.json({ success: false, result: [], message: result.message }, 500)
        }
        const urls = result
          .map(item => item.imgUrl)
          .filter((url): url is string => typeof url === 'string' && url !== '')
        return c.json({ success: true, result: urls })
      }

      let body: unknown
      try {
        body = JSON.parse(bodyText)
      } catch {
        return c.json({ success: false, result: [], message: t('SERVER_INVALID_JSON_BODY') }, 400)
      }

      const parsedBody = parseUploadRequestBody(body)
      if (parsedBody.kind === ParsedUploadRequestBodyKind.Invalid) {
        return c.json({ success: false, result: [], message: t(parsedBody.messageKey) }, 400)
      }

      if (parsedBody.kind === ParsedUploadRequestBodyKind.Clipboard) {
        const result = await ctx.upload()
        if (result instanceof Error) {
          return c.json({ success: false, result: [], message: result.message }, 500)
        }
        const urls = result
          .map(item => item.imgUrl)
          .filter((url): url is string => typeof url === 'string' && url !== '')
        return c.json({ success: true, result: urls })
      }

      const result = await ctx.upload(parsedBody.list)
      if (result instanceof Error) {
        return c.json({ success: false, result: [], message: result.message }, 500)
      }
      const urls = result
        .map(item => item.imgUrl)
        .filter((url): url is string => typeof url === 'string' && url !== '')
      return c.json({ success: true, result: urls })
    } catch (e: unknown) {
      ctx.log.error(e)
      return c.json({ success: false, result: [], message: getErrorMessage(e) }, 500)
    }
  })

  app.post(BuiltinRoutePath.HEARTBEAT, (c) => {
    return c.json({ success: true, result: 'alive' })
  })
}

export { registerCoreRoutes }
