import { serve, type ServerType } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import axios from 'axios'
import { Hono } from 'hono'
import type { AddressInfo } from 'node:net'
import type { Context, Handler, MiddlewareHandler } from 'hono'
import type { IPicGo, IServerManager, PluginRouterSetup } from '../../types'
import { rebuildApp } from './utils'
import { registerCoreRoutes } from './routes'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { BuiltinRoutePath, isBuiltinRoutePath } from '../Routes/routePath'
import type { ILocalesKey } from '../../i18n/zh-CN'

type StartServerResult = {
  server: ServerType
  port: number
}

enum AuthTokenSource {
  Authorization = 'authorization',
  Header = 'header',
  Query = 'query',
  None = 'none'
}

type AuthToken = {
  source: AuthTokenSource
  token?: string
}

const normalizePort = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return undefined
}

const normalizeSecret = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}



class ServerManager implements IServerManager {
  private app: Hono<any, any, any>

  private readonly ctx: IPicGo
  private server?: ServerType
  private listeningPort?: number
  private listeningHost?: string
  private authSecret?: string
  private warnedQuerySecret = false
  private staticRoutePrefixes: string[] = []

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.app = new Hono()
    this.initMiddleware()
    this.initCoreRoutes()
  }

  registerGet<P extends string> (path: P, handler: Handler<any, P>, isInternal = false): void {
    this.handleRegister('get', path, handler, isInternal)
  }

  registerPost<P extends string> (path: P, handler: Handler<any, P>, isInternal = false): void {
    this.handleRegister('post', path, handler, isInternal)
  }

  registerPut<P extends string> (path: P, handler: Handler<any, P>, isInternal = false): void {
    this.handleRegister('put', path, handler, isInternal)
  }

  registerDelete<P extends string> (path: P, handler: Handler<any, P>, isInternal = false): void {
    this.handleRegister('delete', path, handler, isInternal)
  }

  registerMiddleware<P extends string> (path: P, handler: MiddlewareHandler<any, P>): void {
    this.app.use(path, handler)
  }

  registerStatic (path: string, root: string): void {
    const routePath = path.endsWith('/*') ? path : `${path}/*`
    const normalizedPrefix = routePath.replace(/\/\*$/, '') || '/'
    if (!this.staticRoutePrefixes.includes(normalizedPrefix)) {
      this.staticRoutePrefixes.push(normalizedPrefix)
    }
    this.app.use(routePath, serveStatic({ root }))
  }

  private handleRegister (method: 'get' | 'post' | 'put' | 'delete', path: string, handler: Handler, isInternal: boolean) {
    const isBuiltin = isBuiltinRoutePath(path)

    if (isBuiltin && !isInternal) {
      this.ctx.log.warn(`[PicGo Server] Plugin attempted to overwrite builtin route: ${path}. Action denied.`)
      return
    }

    this.app[method](path, handler)
  }

  mount (path: string, setup: PluginRouterSetup): void {
    const subApp = new Hono()
    setup(subApp)
    this.app.route(path, subApp)
  }

  getServerInfo (): string {
    if (this.server && this.listeningHost && this.listeningPort !== undefined) {
      return `http://${this.listeningHost}:${this.listeningPort}/`
    }
    return ''
  }


  isListening (): boolean {
    return this.server !== undefined
  }

  private initMiddleware (): void {
    this.app.use(cors())
    this.app.use((c, next) => this.handleAuth(c, next))
    // TODO: replace with custom logger with ctx.log
    this.app.use(logger())
  }

  private initCoreRoutes (): void {
    registerCoreRoutes(this.app, this.ctx)
  }

  private t<T extends ILocalesKey> (key: T, args?: Record<string, string>): string {
    return this.ctx.i18n?.translate<T>(key, args) ?? String(key)
  }

  private getRequestPath (c: Context): string {
    if (typeof c.req.path === 'string') return c.req.path
    return new URL(c.req.url).pathname
  }

  private isStaticPath (path: string): boolean {
    return this.staticRoutePrefixes.some((prefix) => {
      if (!prefix) return false
      if (prefix === '/') return path === '/'
      return path === prefix || path.startsWith(`${prefix}/`)
    })
  }

  private shouldSkipAuth (method: string, path: string): boolean {
    if (method.toUpperCase() === 'OPTIONS') return true
    if (path === '' || path === '/') return true
    if (this.isStaticPath(path)) return true
    if (isBuiltinRoutePath(path) && path !== BuiltinRoutePath.UPLOAD) return true
    return false
  }

  private extractAuthToken (c: Context): AuthToken {
    const headers = c.req.raw.headers
    if (headers.has('authorization')) {
      const authHeader = headers.get('authorization') ?? ''
      const match = authHeader.match(/^\s*Bearer\s+(.+)$/i)
      return { source: AuthTokenSource.Authorization, token: match?.[1] }
    }

    if (headers.has('x-picgo-secret')) {
      return { source: AuthTokenSource.Header, token: headers.get('x-picgo-secret') ?? '' }
    }

    const url = new URL(c.req.url)
    if (url.searchParams.has('secret')) {
      return { source: AuthTokenSource.Query, token: url.searchParams.get('secret') ?? '' }
    }

    return { source: AuthTokenSource.None }
  }

  private warnQuerySecretOnce (): void {
    if (this.warnedQuerySecret) return
    this.warnedQuerySecret = true
    this.ctx.log.warn(this.t('SERVER_AUTH_QUERY_SECRET_WARNING'))
  }

  private getClientIp (c: Context): string {
    const forwardedFor = c.req.raw.headers.get('x-forwarded-for')
    if (forwardedFor) {
      const first = forwardedFor.split(',')[0]?.trim()
      if (first) return first
    }
    const env = c.env as {
      server?: { incoming?: { socket?: { remoteAddress?: string } } }
      incoming?: { socket?: { remoteAddress?: string } }
    }
    const bindings = env.server ?? env
    return bindings?.incoming?.socket?.remoteAddress ?? 'unknown'
  }

  private logUnauthorized (c: Context): void {
    const ip = this.getClientIp(c)
    this.ctx.log.warn(this.t('SERVER_AUTH_UNAUTHORIZED_REQUEST', { ip }))
  }

  private async handleAuth (c: Context, next: () => Promise<void>): Promise<Response | void> {
    if (!this.authSecret) {
      return await next()
    }

    const method = c.req.method
    const path = this.getRequestPath(c)

    if (this.shouldSkipAuth(method, path)) {
      return await next()
    }

    const { source, token } = this.extractAuthToken(c)
    if (source === AuthTokenSource.Query) {
      this.warnQuerySecretOnce()
    }

    if (!token || token !== this.authSecret) {
      this.logUnauthorized(c)
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    return await next()
  }

  private async startServer (port: number, host: string): Promise<StartServerResult> {
    return await new Promise((resolve, reject) => {
      const server = serve({
        fetch: this.app.fetch,
        port,
        hostname: host
      }, (info: AddressInfo) => {
        server.off('error', onError)
        resolve({
          server,
          port: info.port
        })
      })

      server.once('error', onError)

      function onError (err: any): void {
        server.off('error', onError)
        reject(err)
      }
    })
  }

  private async isExistingPicGoServer (host: string, port: number): Promise<boolean> {
    // "0.0.0.0" means "bind all", but it's not a connectable address.
    const connectHost = (host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host
    const url = `http://${connectHost}:${port}/heartbeat`
    try {
      const res = await axios.post(url, undefined, {
        timeout: 1000
      })
      return res?.data?.success === true && res?.data?.result === 'alive'
    } catch {
      return false
    }
  }

  async listen (port?: number, host?: string, ignoreExistingExternalServer: boolean = false, secret?: string): Promise<number | void> {
    if (this.server && this.listeningPort !== undefined) {
      if (host && this.listeningHost && host !== this.listeningHost) {
        this.ctx.log.warn(`Server is already listening at http://${this.listeningHost}:${this.listeningPort}`)
      }
      return this.listeningPort
    }

    const configPort = this.ctx.getConfig('settings.server.port')
    const configHost = this.ctx.getConfig('settings.server.host')
    const configSecret = this.ctx.getConfig('settings.server.secret')

    const resolvedPort = normalizePort(port) ?? normalizePort(configPort) ?? 36677
    const resolvedHost = (host ?? (typeof configHost === 'string' ? configHost : undefined) ?? '127.0.0.1')

    this.authSecret = normalizeSecret(secret)
      ?? normalizeSecret(process.env.PICGO_SERVER_SECRET)
      ?? normalizeSecret(configSecret)
    this.warnedQuerySecret = false

    this.app = rebuildApp(this.app, this.ctx)

    const tryListen = async (portToTry: number): Promise<number | void> => {
      try {
        const { server, port: actualPort } = await this.startServer(portToTry, resolvedHost)
        this.server = server
        this.listeningPort = actualPort
        this.listeningHost = resolvedHost
        if (this.authSecret) {
          this.ctx.log.info(this.t('SERVER_AUTH_ENABLED'))
        } else {
          this.ctx.log.warn(this.t('SERVER_AUTH_DISABLED_WARNING'))
        }
        this.ctx.log.info(`[PicGo Server] Listening at http://${resolvedHost}:${actualPort}`)
        return actualPort
      } catch (e: any) {
        if (e?.code === 'EADDRINUSE') {
          if (!ignoreExistingExternalServer) {
            const hasExisting = await this.isExistingPicGoServer(resolvedHost, portToTry)
            if (hasExisting) {
              this.ctx.log.info(`[PicGo Server] Detected existing instance at http://${resolvedHost}:${portToTry}`)
              return portToTry
            }
          }
          this.ctx.log.warn(`[PicGo Server] port ${portToTry} is busy, trying with port ${portToTry + 1}`)
          return await tryListen(portToTry + 1)
        }
        this.ctx.log.error(e as Error)
      }
    }

    return await tryListen(resolvedPort)
  }

  shutdown (): void {
    try {
      this.server?.close()
    } catch {
      // ignore
    } finally {
      this.server = undefined
      this.listeningPort = undefined
      this.listeningHost = undefined
      this.authSecret = undefined
      this.warnedQuerySecret = false
    }
  }
}

export { ServerManager }
