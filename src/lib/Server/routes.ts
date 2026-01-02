import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import path from 'path'
import type { Hono } from 'hono'
import type { IPicGo } from '../../types'

type UploadRequestBody = {
  list: string[]
}

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

const isUploadRequestBody = (value: unknown): value is UploadRequestBody => {
  if (typeof value !== 'object' || value === null) return false
  if (!('list' in value)) return false
  const list = (value as { list?: unknown }).list
  if (!Array.isArray(list) || list.length === 0) return false
  return list.every((item) => typeof item === 'string' && item.trim() !== '')
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
  app.post('/upload', async (c) => {
    try {
      const contentType = c.req.raw.headers.get('content-type') || ''

      if (contentType.includes('multipart/form-data')) {
        const tempDir = path.join(ctx.baseDir, 'picgo-form-images')
        const tempFiles: string[] = []
        try {
          await fs.ensureDir(tempDir)
          const formData = await c.req.formData()
          const files = formData.getAll('files') as unknown[]
          if (files.length === 0) {
            return c.json({ success: false, result: [], message: 'No files found in form-data: files' }, 400)
          }

          for (const file of files) {
            if (!isFormDataFileLike(file)) {
              return c.json({ success: false, result: [], message: 'Invalid form-data: files must be file(s)' }, 400)
            }

            const fileName = getFormDataFileName(file)
            const safeName = path.basename(fileName)
            const ext = path.extname(safeName)
            console.log(fileName, safeName, ext)
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
        return c.json({ success: false, result: [], message: 'Invalid JSON body' }, 400)
      }

      if (!isUploadRequestBody(body)) {
        return c.json({ success: false, result: [], message: 'Invalid request body: { list: string[] } required' }, 400)
      }

      const result = await ctx.upload(body.list)
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

  app.post('/heartbeat', (c) => {
    return c.json({ success: true, result: 'alive' })
  })
}

export { registerCoreRoutes }
