import type { IPicGo } from '../../types'
import type { Context } from 'hono'
import * as crypto from 'node:crypto'

class AuthHandler {
  private readonly ctx: IPicGo
  private authState: string | null = null
  private pending?: {
    resolve: (token: string) => void
    shouldShutdown: boolean
  }

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.registerRoutes()
  }

  async startLoginFlow (): Promise<string> {
    if (this.pending) {
      throw new Error('Login is already in progress')
    }

    const wasListening = this.ctx.server.isListening()

    const tokenPromise = new Promise<string>((resolve) => {
      this.pending = {
        resolve,
        shouldShutdown: !wasListening
      }
    })

    // For login flow, always ignore existing PicGo server instances (other processes),
    // because we must register /auth/callback in current process.
    const actualPort = await this.ctx.server.listen(undefined, '127.0.0.1', true)
    if (actualPort === undefined) {
      throw new Error('Failed to start PicGo server for login')
    }
    const callback = encodeURIComponent(`http://127.0.0.1:${actualPort}/auth/callback`)
    this.authState = crypto.randomUUID()
    const authUrl = `https://picgocloud.com/auth/cli?callback=${callback}&state=${this.authState}`

    try {
      await this.ctx.openUrl(authUrl)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      this.ctx.log.warn(`Failed to open browser automatically: ${message}`)
      this.ctx.log.info(`Please open this url in browser: ${authUrl}`)
    }

    return await tokenPromise
  }

  private renderResultPage (success: boolean, message: string): string {
    const color = success ? '#2ecc71' : '#e74c3c'
    const title = success ? 'Authorization Successful!' : 'Authorization Failed'
    const icon = success ? '✓' : '✕'

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>PicGo Auth</title>
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
      this.ctx.log.warn('[Auth] State mismatch or missing. Request blocked.')
      return c.html(this.renderResultPage(false, 'Invalid State. Please try logging in again.'), 403)
    }

    if (!token) {
      return c.html(this.renderResultPage(false, 'Token missing in callback.'), 400)
    }

    this.ctx.saveConfig({
      'settings.picgoCloud.token': token
    })

    this.authState = null

    const pending = this.pending
    this.pending = undefined
    pending?.resolve(token)

    if (pending?.shouldShutdown) {
      setTimeout(() => {
        this.ctx.server.shutdown()
      }, 100)
    }

    return c.html(this.renderResultPage(true, 'You can now close this window and return to PicGo.'), 200)
  }

  private registerRoutes (): void {
    this.ctx.server.app.get('/auth/callback', this.handleCallback.bind(this))
  }
}

export { AuthHandler }
