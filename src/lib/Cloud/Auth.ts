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

  private handleCallback (c: Context) {
    const token = c.req.query('token')
    const state = c.req.query('state')

    if (!state || state !== this.authState) {
      this.ctx.log.warn('[Auth] State mismatch or missing. Request blocked.')
      return c.json({
        success: false,
        message: 'Invalid auth state.'
      }, 403)
    }

    if (!token) {
      return c.json({
        success: false,
        message: 'Token missing in callback.'
      }, 400)
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

    return c.json({
      success: true,
      message: 'Authentication successful. You can close this window.'
    }, 200)
  }

  private registerRoutes (): void {
    this.ctx.server.app.get('/auth/callback', this.handleCallback.bind(this))
  }
}

export { AuthHandler }
