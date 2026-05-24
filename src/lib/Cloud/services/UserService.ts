import type { ICloudUserInfo, IConfig, IPicGo } from '../../../types'
import { AuthRequestClient } from '../Request'
import { buildMockWhoami, getMockScenario } from '../__mocks__/lifecycleScenarios'

class UserService {
  private readonly client: AuthRequestClient
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.client = new AuthRequestClient(ctx)
    this.ctx = ctx
  }

  async whoami (token: string): Promise<ICloudUserInfo> {
    const mockScenario = getMockScenario()
    if (mockScenario) {
      this.ctx.log.warn(`[MOCK] UserService.whoami scenario=${mockScenario}`)
      return buildMockWhoami(mockScenario)
    }
    return await this.client.request<ICloudUserInfo>({
      method: 'GET',
      url: '/api/whoami'
    }, token)
  }

  async setAutoImport (autoImport: boolean, token?: string): Promise<ICloudUserInfo> {
    const response = await this.client.request<{
      success: boolean
      user: {
        name: string | null
        image: string | null
      }
    }>({
      method: 'PUT',
      url: '/api/profile/me',
      data: {
        extra: {
          autoImport
        }
      }
    }, token)

    return {
      user: response.user.name,
      avatar: response.user.image,
      autoImport
    }
  }

  async verifyToken (token: string): Promise<boolean> {
    try {
      const res = await this.whoami(token)
      this.ctx.log.success('Welcome:', res.user ?? 'Unknown user')
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
