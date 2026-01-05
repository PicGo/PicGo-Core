import type { IPicGo } from '../../../types'
import { RequestClient } from '../Request'

class UserService {
  private readonly request: RequestClient

  constructor (ctx: IPicGo) {
    this.request = new RequestClient(ctx)
  }

  async verifyToken (token: string): Promise<boolean> {
    try {
      const res = await this.request.request({
        method: 'GET',
        url: '/api/user'
      }, token)
      console.log(res)
      return true
    } catch {
      return false
    }
  }
}

export { UserService }
