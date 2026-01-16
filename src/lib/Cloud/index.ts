import type { ICloudManager, IPicGo } from '../../types'
import axios from 'axios'
import { AuthHandler } from './Auth'
import { UserService } from './services/UserService'
import type { ILocalesKey } from '../../i18n/zh-CN'

class CloudManager implements ICloudManager {
  private readonly ctx: IPicGo
  private readonly auth: AuthHandler

  user: UserService

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.user = new UserService(ctx)
    this.auth = new AuthHandler(ctx)
  }

  async login (token?: string): Promise<void> {
    if (token) {
      const ok = await this.user.verifyToken(token)
      if (!ok) {
        throw new Error(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_INVALID_TOKEN'))
      }
      this.ctx.saveConfig({
        'settings.picgoCloud.token': token
      })
      this.ctx.log.success(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_SUCCESS'))
      return
    }

    const existingToken = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')
    if (existingToken) {
      const ok = await this.user.verifyToken(existingToken)
      if (ok) {
        this.ctx.log.success(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_SUCCESS'))
        return
      }
    }
    await this.auth.startLoginFlow()
    this.ctx.log.success(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_SUCCESS'))
  }

  logout (): void {
    this.ctx.removeConfig('settings.picgoCloud', 'token')
    this.ctx.log.success(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGOUT_SUCCESS'))
  }

  disposeLoginFlow (): void {
    this.auth.disposeLoginFlow()
  }

  async getUserInfo (): Promise<{ user: string } | null> {
    const token = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')
    if (!token) return null

    try {
      return await this.user.whoami(token)
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status
        if (status === 401 || status === 403) {
          // Treat invalid token as logged-out and clear it for later retries.
          this.ctx.removeConfig('settings.picgoCloud', 'token')
          return null
        }
        const message = (e.response?.data as { message?: string } | undefined)?.message ?? e.message
        throw new Error(message)
      }
      throw e
    }
  }
}

export { CloudManager }
