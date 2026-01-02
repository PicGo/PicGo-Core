import type { ICloudManager, IPicGo } from '../../types'
import { AuthHandler } from './Auth'
import { UserService } from './services/User'

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
        throw new Error('Invalid token')
      }
      this.ctx.saveConfig({
        'settings.picgoCloud.token': token
      })
      this.ctx.log.success('Login success!')
      return
    }

    const existingToken = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')
    if (existingToken) {
      const ok = await this.user.verifyToken(existingToken)
      if (ok) {
        this.ctx.log.success('Login success!')
        return
      }
    }

    await this.auth.startLoginFlow()
    this.ctx.log.success('Login success!')
  }

  logout (): void {
    this.ctx.removeConfig('settings.picgoCloud', 'token')
    this.ctx.log.success('Logout success!')
  }
}

export { CloudManager }
