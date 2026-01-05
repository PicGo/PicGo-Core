import axios, { type AxiosRequestConfig } from 'axios'
import type { IPicGo } from '../../types'
import { BASE_URL } from '../utils'

class RequestClient {
  private readonly ctx: IPicGo
  private readonly baseURL: string

  constructor (ctx: IPicGo, baseURL: string = BASE_URL) {
    this.ctx = ctx
    this.baseURL = baseURL
  }

  async request<T = any> (config: AxiosRequestConfig, token?: string): Promise<T> {
    const finalToken = token ?? this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')
    const headers: Record<string, string> = {
      ...(config.headers as any)
    }
    if (finalToken) {
      headers.Authorization = `Bearer ${finalToken}`
    }
    const res = await axios.request<T>({
      baseURL: this.baseURL,
      ...config,
      headers
    })
    return res.data
  }
}

export { RequestClient }
