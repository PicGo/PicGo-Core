import type { AxiosRequestConfig } from 'axios'
import type { IPicGo } from '../../types'
import { API_BASE_URL } from '../utils'
import { isRecord } from './utils'

type ICloudErrorData = {
  success?: boolean
  code?: string
  message?: string
  [key: string]: unknown
}

type ICloudRequestErrorResponse = {
  status: number
  data: unknown
}

type ICloudRequestError = Error & {
  isAxiosError: true
  code?: string
  status?: number
  response?: ICloudRequestErrorResponse
}

type ICloudServiceError = Error & {
  apiCode?: string
  status?: number
}

type IRequestErrorShape = {
  message?: string
  code?: string
  statusCode?: number
  response?: {
    status?: number
    body?: unknown
  }
}

type ICloudErrorLike = {
  status?: number
  code?: string
  apiCode?: string
  response?: {
    status?: number
    data?: unknown
  }
} | null | undefined

const isCloudErrorData = (value: unknown): value is ICloudErrorData => {
  return isRecord(value)
}

const isRequestErrorShape = (error: unknown): error is IRequestErrorShape => {
  return typeof error === 'object' && error !== null && (
    'statusCode' in error ||
    'response' in error ||
    'message' in error
  )
}

const normalizeRequestError = (error: IRequestErrorShape): ICloudRequestError => {
  const responseData = error.response?.body
  const normalizedMessage = isCloudErrorData(responseData) && typeof responseData.message === 'string'
    ? responseData.message
    : error.message || 'Request failed'
  const normalized = new Error(normalizedMessage) as ICloudRequestError
  const status = error.response?.status ?? error.statusCode ?? 0

  normalized.name = 'AxiosError'
  normalized.isAxiosError = true
  normalized.status = status
  if (isCloudErrorData(responseData) && typeof responseData.code === 'string') {
    normalized.code = responseData.code
  } else if (typeof error.code === 'string') {
    normalized.code = error.code
  }
  normalized.response = {
    status,
    data: responseData
  }

  return normalized
}

const getCloudErrorData = (error: unknown): ICloudErrorData | undefined => {
  const err = error as ICloudErrorLike
  const data = err?.response?.data
  return isCloudErrorData(data) ? data : undefined
}

const getCloudErrorStatus = (error: unknown): number | undefined => {
  const err = error as ICloudErrorLike
  const status = err?.response?.status ?? err?.status
  return typeof status === 'number' ? status : undefined
}

const getCloudErrorCode = (error: unknown): string | undefined => {
  const err = error as ICloudErrorLike
  const code = err?.apiCode ?? getCloudErrorData(error)?.code ?? err?.code
  return typeof code === 'string' ? code : undefined
}

const getCloudErrorMessage = (error: unknown, fallback: string = 'Request failed'): string => {
  const message = getCloudErrorData(error)?.message ??
    (error instanceof Error ? error.message : undefined) ??
    (isRecord(error) && typeof error.message === 'string' ? error.message : undefined)
  return typeof message === 'string' && message.trim() !== '' ? message : fallback
}

const createCloudServiceError = (message: string, cause?: unknown): ICloudServiceError => {
  const serviceError = new Error(message, cause === undefined ? undefined : { cause }) as ICloudServiceError
  serviceError.status = getCloudErrorStatus(cause)
  serviceError.apiCode = getCloudErrorCode(cause)
  return serviceError
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
export {
  createCloudServiceError,
  getCloudErrorData,
  getCloudErrorCode,
  getCloudErrorMessage,
  getCloudErrorStatus
}

export type {
  ICloudErrorData,
  ICloudRequestError,
  ICloudServiceError
}
