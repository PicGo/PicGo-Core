import type { ICloudManager, ICloudUserInfo, IPicGo } from '../../types'
import axios from 'axios'
import { AuthHandler } from './Auth'
import { UserService } from './services/UserService'
import { AlbumService } from './services/AlbumService'
import type { ILocalesKey } from '../../i18n/zh-CN'
import { createCloudServiceError, getCloudErrorMessage, getCloudErrorStatus } from './Request'

class CloudManager implements ICloudManager {
  private readonly ctx: IPicGo
  private readonly auth: AuthHandler
  private albumService?: AlbumService
  private userInfoCache: ICloudUserInfo | null | undefined
  private userInfoPromise?: Promise<ICloudUserInfo | null>

  user: UserService

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.user = new UserService(ctx)
    this.auth = new AuthHandler(ctx)
  }

  get album (): AlbumService {
    if (!this.albumService) {
      this.albumService = new AlbumService(this.ctx)
    }

    return this.albumService
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
      this.clearUserInfoCache()
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
    this.clearUserInfoCache()
    this.ctx.log.success(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGIN_SUCCESS'))
  }

  logout (): void {
    this.clearUserInfoCache()
    this.ctx.removeConfig('settings.picgoCloud', 'token')
    this.ctx.log.success(this.ctx.i18n.translate<ILocalesKey>('CLOUD_LOGOUT_SUCCESS'))
  }

  disposeLoginFlow (): void {
    this.auth.disposeLoginFlow()
  }

  async getUserInfo (): Promise<ICloudUserInfo | null> {
    const token = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')
    if (!token) {
      this.clearUserInfoCache()
      return null
    }

    if (this.userInfoCache !== undefined) {
      return this.userInfoCache
    }

    if (!this.userInfoPromise) {
      this.userInfoPromise = this.fetchUserInfo(token)
    }

    try {
      return await this.userInfoPromise
    } finally {
      this.userInfoPromise = undefined
    }
  }

  async refreshUserInfo (): Promise<ICloudUserInfo | null> {
    this.clearUserInfoCache()
    return await this.getUserInfo()
  }

  private async fetchUserInfo (token: string): Promise<ICloudUserInfo | null> {
    try {
      const userInfo = await this.user.whoami(token)
      this.userInfoCache = userInfo
      return userInfo
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const status = getCloudErrorStatus(e)
        if (status === 401) {
          this.clearUserInfoCache()
          this.ctx.removeConfig('settings.picgoCloud', 'token')
          return null
        }
        const message = getCloudErrorMessage(e)
        if (message.trim() !== '') {
          throw createCloudServiceError(message, e)
        }
      }
      throw e
    }
  }

  private clearUserInfoCache (): void {
    this.userInfoCache = undefined
    this.userInfoPromise = undefined
  }
}

export { CloudManager }
