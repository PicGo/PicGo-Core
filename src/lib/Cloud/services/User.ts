import type { IPicGo } from '../../../types'
import { RequestClient } from '../Request'

class UserService {
  private readonly request: RequestClient
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.request = new RequestClient(ctx)
    this.ctx = ctx
  }

  async verifyToken (token: string): Promise<boolean> {
    try {
      const res = await this.request.request<{ user: string }>({
        method: 'GET',
        url: '/api/whoami'
      }, token)
      this.ctx.log.success('Welcome:', res.user)
      return true
    } catch {
      return false
    }
  }
}

export { UserService }
