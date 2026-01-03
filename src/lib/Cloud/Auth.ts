import type { IPicGo } from '../../types'

class AuthHandler {
  private readonly ctx: IPicGo
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
    const authUrl = `https://picgocloud.com/auth/cli?callback=${callback}`

    try {
      await this.ctx.openUrl(authUrl)
    } catch (e: any) {
      this.ctx.log.warn(`Failed to open browser automatically: ${e?.message || String(e)}`)
      this.ctx.log.info(`Please open this url in browser: ${authUrl}`)
    }

    return await tokenPromise
  }

  private registerRoutes (): void {
    this.ctx.server.app.get('/auth/callback', (c) => {
      const token = c.req.query('token')
      if (!token) {
        return c.html('<h1>Login Failed</h1><p>Missing token.</p>', 400)
      }

      this.ctx.saveConfig({
        'settings.picgoCloud.token': token
      })

      const pending = this.pending
      this.pending = undefined
      pending?.resolve(token)

      if (pending?.shouldShutdown) {
        setTimeout(() => {
          this.ctx.server.shutdown()
        }, 100)
      }

      return c.html('<h1>Login Success</h1>')
    })
  }
}

export { AuthHandler }
