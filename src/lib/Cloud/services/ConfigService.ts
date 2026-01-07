import axios from 'axios'
import type { IPicGo } from '../../../types'
import type { IE2ERequestFields, ISyncConfigResponse } from '../../ConfigSyncManager/types'
import { AuthRequestClient } from '../Request'

export interface IUpdateConfigResult {
  success: boolean
  version: number
  conflict?: boolean
}

export class ConfigService {
  private readonly client: AuthRequestClient
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.client = new AuthRequestClient(ctx)
    this.ctx = ctx
  }

  async fetchConfig (): Promise<ISyncConfigResponse | null> {
    try {
      const res = await this.client.request<ISyncConfigResponse>({
        method: 'GET',
        url: '/api/config'
      })

      if (!res?.config || res.config.trim() === '') {
        return null
      }

      return res
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status
        if (status === 404) {
          return null
        }
        const message = e.response?.data?.message ?? e.message
        this.ctx.log.warn('[ConfigService] Failed to fetch config:', message)
        throw new Error(message)
      }
      throw e
    }
  }

  async updateConfig (configStr: string, baseVersion: number, e2eFields?: IE2ERequestFields): Promise<IUpdateConfigResult> {
    try {
      const res = await this.client.request<{ version: number }>({
        method: 'PUT',
        url: '/api/config',
        data: {
          config: configStr,
          baseVersion,
          historyLimit: 10,
          ...(e2eFields ?? {})
        }
      })

      return {
        success: true,
        version: res.version
      }
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const data = e.response?.data
        if (data?.code === 'CONFIG_CONFLICT') {
          return {
            success: false,
            conflict: true,
            version: typeof data.currentVersion === 'number' ? data.currentVersion : baseVersion
          }
        }
        const message = data?.message ?? e.message
        this.ctx.log.warn('[ConfigService] Failed to update config:', message)
        throw new Error(message)
      }
      throw e
    }
  }
}
