import type { IConfig, IPicGo } from '../../../types'
import { AuthRequestClient } from '../Request'

class UserService {
  private readonly client: AuthRequestClient
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.client = new AuthRequestClient(ctx)
    this.ctx = ctx
  }

  async verifyToken (token: string): Promise<boolean> {
    try {
      const res = await this.client.request<{ user: string }>({
        method: 'GET',
        url: '/api/whoami'
      }, token)
      this.ctx.log.success('Welcome:', res.user)
      return true
    } catch {
      return false
    }
  }

  async getUserConfig (token: string): Promise<IConfig> {
    try {
      const res = await this.client.request<{ config: string }>({
        method: 'GET',
        url: '/api/config'
      }, token)
      return JSON.parse(res.config)
    } catch {
      throw new Error('Failed to fetch user config from server')
    }
  }
}

export { UserService }
