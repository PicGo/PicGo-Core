import axios from 'axios'
import type { IPicGo } from '../../../types'
import { AuthRequestClient } from '../Request'

export interface IFetchConfigResult {
  version: number
  config: string
}

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

  async fetchConfig (): Promise<IFetchConfigResult | null> {
    try {
      const res = await this.client.request<IFetchConfigResult>({
        method: 'GET',
        url: '/api/config'
      })

      if (!res?.config || res.config.trim() === '') {
        return null
      }

      return {
        version: res.version,
        config: res.config
      }
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

  async updateConfig (configStr: string, baseVersion: number): Promise<IUpdateConfigResult> {
    try {
      const res = await this.client.request<{ version: number }>({
        method: 'PUT',
        url: '/api/config',
        data: {
          config: configStr,
          baseVersion,
          historyLimit: 10
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
