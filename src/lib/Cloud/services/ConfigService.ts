import axios from 'axios'
import type { IPicGo } from '../../../types'
import type { IE2ERequestFields, ISyncConfigResponse } from '../../ConfigSyncManager/types'
import { APPType } from '../../ConfigSyncManager/types'
import { ApiErrorCode } from '../ApiErrorCode'
import { AuthRequestClient, createCloudServiceError, getCloudErrorCode, getCloudErrorMessage, getCloudErrorStatus } from '../Request'

export interface IUpdateConfigResult {
  success: boolean
  version: number
  conflict?: boolean
}

export class ConfigService {
  private readonly client: AuthRequestClient
  private readonly ctx: IPicGo
  private appType: APPType = APPType.CLI

  constructor (ctx: IPicGo) {
    this.client = new AuthRequestClient(ctx)
    this.ctx = ctx
  }

  async fetchConfig (): Promise<ISyncConfigResponse | null> {
    this.appType = this.ctx.GUI_VERSION ? APPType.GUI : APPType.CLI
    const now = Date.now()
    try {
      const res = await this.client.request<ISyncConfigResponse>({
        method: 'GET',
        url: '/api/config',
        params: {
          appType: this.appType
        }
      })

      if (!res?.config || res.config.trim() === '') {
        return null
      }
      this.ctx.log.debug(`[ConfigService] Config fetched successfully in ${Date.now() - now} ms, version: ${res.version}`)
      return res
    } catch (e: unknown) {
      this.ctx.log.debug(`[ConfigService] Failed to fetch config in ${Date.now() - now} ms`)
      if (axios.isAxiosError(e)) {
        const status = getCloudErrorStatus(e)
        const apiCode = getCloudErrorCode(e)
        if (status === 404 || apiCode === ApiErrorCode.ConfigNotFound) {
          return null
        }
        const message = getCloudErrorMessage(e)
        this.ctx.log.warn('[ConfigService] Failed to fetch config:', message)
        throw createCloudServiceError(message, e)
      }
      throw e
    }
  }

  async updateConfig (configStr: string, baseVersion: number, e2eFields?: IE2ERequestFields): Promise<IUpdateConfigResult> {
    this.appType = this.ctx.GUI_VERSION ? APPType.GUI : APPType.CLI
    const now = Date.now()
    try {
      const res = await this.client.request<{ version: number }>({
        method: 'PUT',
        url: '/api/config',
        data: {
          appType: this.appType,
          config: configStr,
          baseVersion,
          historyLimit: 10,
          ...(e2eFields ?? {})
        }
      })
      this.ctx.log.debug(`[ConfigService] Config updated successfully in ${Date.now() - now} ms, new version: ${res.version}`)
      return {
        success: true,
        version: res.version
      }
    } catch (e: unknown) {
      this.ctx.log.debug(`[ConfigService] Failed to update config in ${Date.now() - now} ms`)
      if (axios.isAxiosError(e)) {
        const data = e.response?.data as { currentVersion?: number } | undefined
        if (getCloudErrorCode(e) === ApiErrorCode.ConfigConflict) {
          return {
            success: false,
            conflict: true,
            version: typeof data?.currentVersion === 'number' ? data.currentVersion : baseVersion
          }
        }
        const message = getCloudErrorMessage(e)
        this.ctx.log.warn('[ConfigService] Failed to update config:', message)
        throw createCloudServiceError(message, e)
      }
      throw e
    }
  }
}
