import type { AxiosRequestConfig } from 'axios'
import type { IPicGo } from '../../types'
import { API_BASE_URL } from '../utils'

type ICloudRequestErrorResponse = {
  status: number
  data: unknown
}

type ICloudRequestError = Error & {
  isAxiosError: true
  code?: string
  response?: ICloudRequestErrorResponse
}

type IRequestErrorShape = {
  message?: string
  statusCode?: number
  response?: {
    status?: number
    body?: unknown
  }
}

const isRequestErrorShape = (error: unknown): error is IRequestErrorShape => {
  return typeof error === 'object' && error !== null && (
    'statusCode' in error ||
    'response' in error ||
    'message' in error
  )
}

const normalizeRequestError = (error: IRequestErrorShape): ICloudRequestError => {
  const normalized = new Error(error.message || 'Request failed') as ICloudRequestError
  const status = error.response?.status ?? error.statusCode ?? 0

  normalized.name = 'AxiosError'
  normalized.isAxiosError = true
  normalized.response = {
    status,
    data: error.response?.body
  }

  return normalized
}

/**
 * Authenticated Request Client for PicGo Cloud API
 */
class AuthRequestClient {
  private readonly ctx: IPicGo
  private readonly baseURL: string

  constructor (ctx: IPicGo, baseURL: string = API_BASE_URL) {
    this.ctx = ctx
    this.baseURL = baseURL
  }

  private resolveUrl (url: string): string {
    return new URL(url, this.baseURL).toString()
  }

  async request<T = any> (config: AxiosRequestConfig, token?: string): Promise<T> {
    const finalToken = token ?? this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')
    const headers = { ...(config.headers || {}) }
    if (finalToken) {
      headers.Authorization = `Bearer ${finalToken}`
      if (process.env.ENABLE_PICGO_CLOUD_DEV_MODE) {
        headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID || ''
        headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET || ''
      }
    }

    try {
      return await this.ctx.request<T, AxiosRequestConfig>({
        ...config,
        url: this.resolveUrl(config.url || ''),
        headers
      })
    } catch (error: unknown) {
      if (isRequestErrorShape(error)) {
        throw normalizeRequestError(error)
      }
      throw error
    }
  }
}

export { AuthRequestClient }
