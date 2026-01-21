import type { IPicGo } from '../../types'
import type { Context } from 'hono'
import * as crypto from 'node:crypto'
import { BuiltinRoutePath } from '../Routes/routePath'
import { IInternalServerManager } from '../../types/internal'
import { CLOUD_BASE_URL } from '../utils'
import type { ILocalesKey } from '../../i18n/zh-CN'

type IPendingLogin = {
  resolve: (token: string) => void
  reject: (error: Error) => void
  shouldShutdown: boolean
  abortController: AbortController
}

class AuthHandler {
  private readonly ctx: IPicGo
  private authState: string | null = null
  private pending?: IPendingLogin

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.registerRoutes()
  }

  disposeLoginFlow (): void {
    const pending = this.pending
    if (!pending) return

    const cancelMsg = this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_CANCELLED')
    pending.abortController.abort(new Error(cancelMsg))
  }

  async startLoginFlow (): Promise<string> {
    if (this.pending) {
      throw new Error(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_IN_PROGRESS'))
    }

    const wasListening = this.ctx.server.isListening()
    const abortController = new AbortController()

    const tokenPromise = new Promise<string>((resolve, reject) => {
      this.pending = {
        resolve,
        reject,
        shouldShutdown: !wasListening,
        abortController
      }

      abortController.signal.addEventListener('abort', () => {
        const current = this.pending
        if (!current || current.abortController !== abortController) return

        this.pending = undefined
        this.authState = null

        const reason = abortController.signal.reason
        const fallback = this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_CANCELLED')
        const error = reason instanceof Error ? reason : new Error(String(reason ?? fallback))
        reject(error)

        if (current.shouldShutdown) {
          setTimeout(() => {
            this.ctx.server.shutdown()
          }, 100)
        }
      }, { once: true })
    })

    // For login flow, always ignore existing PicGo server instances (other processes),
    // because we must register /auth/callback in current process.
    let actualPort: number | void
    try {
      actualPort = await this.ctx.server.listen(undefined, '127.0.0.1', true)
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e))
      abortController.abort(error)
      return await tokenPromise
    }

    if (actualPort === undefined) {
      abortController.abort(new Error(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_SERVER_START_FAILED')))
      return await tokenPromise
    }

    if (abortController.signal.aborted) {
      return await tokenPromise
    }

    const callback = encodeURIComponent(`http://127.0.0.1:${actualPort}/auth/callback`)
    this.authState = crypto.randomUUID()
    const authUrl = `${CLOUD_BASE_URL}?callback=${callback}&state=${this.authState}`

    if (abortController.signal.aborted) {
      return await tokenPromise
    }

    try {
      await this.ctx.openUrl(authUrl)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      this.ctx.log.warn(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_OPEN_BROWSER_FAILED', { message }))
      this.ctx.log.info(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_OPEN_BROWSER_TIP', { url: authUrl }))
    }

    return await tokenPromise
  }

  private renderResultPage (success: boolean, message: string): string {
    const color = success ? '#2ecc71' : '#e74c3c'
    const title = success
      ? this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_RESULT_SUCCESS_TITLE')
      : this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_RESULT_FAILED_TITLE')
    const icon = success ? '✓' : '✕'
    const pageTitle = this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_PAGE_TITLE')

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>${pageTitle}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f0f2f5;
            }
            .card {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 440px;
              width: calc(100% - 48px);
            }
            .icon {
              width: 64px;
              height: 64px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 16px;
              background: ${color};
              color: #fff;
              font-size: 36px;
              line-height: 1;
            }
            h1 {
              color: ${color};
              margin: 0 0 12px;
              font-size: 24px;
            }
            p {
              color: #666;
              margin: 0 0 24px;
              line-height: 1.5;
            }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background: #333;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              font-size: 14px;
              cursor: pointer;
              user-select: none;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">${icon}</div>
            <h1>${title}</h1>
            <p>${message}</p>
          </div>
        </body>
      </html>
    `
  }

  private handleCallback (c: Context) {
    const token = c.req.query('token')
    const state = c.req.query('state')

    if (!state || state !== this.authState) {
      this.ctx.log.warn(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_STATE_MISMATCH_WARN'))
      return c.html(this.renderResultPage(false, this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_STATE_INVALID')), 403)
    }

    if (!token) {
      return c.html(this.renderResultPage(false, this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_TOKEN_MISSING')), 400)
    }

    const pending = this.pending
    if (!pending || pending.abortController.signal.aborted) {
      return c.html(this.renderResultPage(false, this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_NOT_IN_PROGRESS')), 409)
    }

    this.ctx.saveConfig({
      'settings.picgoCloud.token': token
    })

    this.authState = null

    this.pending = undefined
    pending?.resolve(token)

    if (pending?.shouldShutdown) {
      setTimeout(() => {
        this.ctx.server.shutdown()
      }, 100)
    }

    return c.html(this.renderResultPage(true, this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_RESULT_SUCCESS_MESSAGE')), 200)
  }

  private registerRoutes (): void {
    (this.ctx.server as IInternalServerManager).registerGet(BuiltinRoutePath.AUTH_CALLBACK, this.handleCallback.bind(this), true)
  }
}

export { AuthHandler }
