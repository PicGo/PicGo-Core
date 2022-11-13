/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/promise-function-async */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { IPicGo, Undefinable, IConfigChangePayload, IConfig, IRequestConfig, IOldReqOptions, IResponse, IFullResponse, IRequest } from '../types'
import { IBusEvent } from '../utils/enum'
import { eventBus } from '../utils/eventBus'
import { URL } from 'url'
import FormData from 'form-data'
import https from 'https'
import tunnel from 'tunnel'
const httpsAgent = new https.Agent({
  maxVersion: 'TLSv1.2',
  minVersion: 'TLSv1.2'
})

// thanks for https://github.dev/request/request/blob/master/index.js
function appendFormData (form: FormData, key: string, data: any): void {
  if (typeof data === 'object' && 'value' in data && 'options' in data) {
    form.append(key, data.value, data.options)
  } else {
    form.append(key, data)
  }
}

function requestInterceptor (options: IOldReqOptions | AxiosRequestConfig): AxiosRequestConfig & {
  __isOldOptions?: boolean
} {
  let __isOldOptions = false
  const opt: AxiosRequestConfig<any> & {
    __isOldOptions?: boolean
  } = {
    ...options,
    url: (options.url as string) || '',
    headers: options.headers || {}
  }
  // user request config proxy
  if (options.proxy) {
    let proxyOptions = options.proxy
    if (typeof proxyOptions === 'string') {
      try {
        proxyOptions = new URL(options.proxy)
      } catch (e) {
        proxyOptions = false
        opt.proxy = false
        console.error(e)
      }
      __isOldOptions = true
    }
    if (proxyOptions) {
      if (options.url?.startsWith('https://')) {
        opt.proxy = false
        opt.httpsAgent = tunnel.httpsOverHttp({
          proxy: {
            host: proxyOptions?.hostname,
            port: parseInt(proxyOptions?.port, 10)
          }
        })
      } else {
        opt.proxy = {
          host: proxyOptions.hostname,
          port: parseInt(proxyOptions.port, 10),
          protocol: 'http'
        }
      }
    }
  }
  if ('formData' in options) {
    const form = new FormData()
    for (const key in options.formData) {
      const data = options.formData[key]
      appendFormData(form, key, data)
    }
    opt.data = form
    opt.headers = Object.assign(opt.headers || {}, form.getHeaders())
    __isOldOptions = true
    // @ts-expect-error
    delete opt.formData
  }
  if ('body' in options) {
    opt.data = options.body
    __isOldOptions = true
    // @ts-expect-error
    delete opt.body
  }
  if ('qs' in options) {
    opt.params = options.qs
    __isOldOptions = true
  }
  opt.__isOldOptions = __isOldOptions
  return opt
}

function responseInterceptor (response: AxiosResponse): IFullResponse {
  return {
    ...response,
    statusCode: response.status,
    body: response.data
  }
}

function responseErrorHandler (error: any) {
  // if (error.response) {
  //   // The request was made and the server responded with a status code
  //   // that falls out of the range of 2xx
  //   return Promise.reject(erro)
  // } else if (error.request) {
  //   // The request was made but no response was received
  //   // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
  //   // http.ClientRequest in node.js
  //   return Promise.reject(error.request)
  // } else {
  //   // Something happened in setting up the request that triggered an Error
  //   return Promise.reject(error.message)
  // }
  const errorObj = {
    method: error?.config?.method?.toUpperCase() || '',
    url: error?.config?.url || '',
    statusCode: error?.response?.status || 0,
    message: error?.message || '',
    stack: error?.stack || {},
    response: {
      status: error?.response?.status || 0,
      statusCode: error?.response?.status || 0,
      body: error?.response?.data || ''
    }
  }
  return Promise.reject(errorObj)
}

export class Request implements IRequest {
  private readonly ctx: IPicGo
  private proxy: Undefinable<string> = ''
  options: AxiosRequestConfig<any> = {}
  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.init()
    eventBus.on(IBusEvent.CONFIG_CHANGE, (data: IConfigChangePayload<string | IConfig['picBed']>) => {
      switch (data.configName) {
        case 'picBed':
          if ((data.value as IConfig['picBed'])?.proxy) {
            this.proxy = (data.value as IConfig['picBed']).proxy
          }
          break
        case 'picBed.proxy':
          this.proxy = data.value as string
          break
      }
    })
  }

  private init (): void {
    const proxy = this.ctx.getConfig<Undefinable<string>>('picBed.proxy')
    if (proxy) {
      this.proxy = proxy
    }
  }

  private handleProxy (): AxiosRequestConfig['proxy'] | false {
    if (this.proxy) {
      try {
        const proxyOptions = new URL(this.proxy)
        return {
          host: proxyOptions.hostname,
          port: parseInt(proxyOptions.port || '0', 10),
          protocol: proxyOptions.protocol
        }
      } catch (e) {
      }
    }
    return false
  }

  // #64 dynamic get proxy value
  request<T, U extends (
    IRequestConfig<U> extends IOldReqOptions ? IOldReqOptions : IRequestConfig<U> extends AxiosRequestConfig ? AxiosRequestConfig : never
  )> (options: U): Promise<IResponse<T, U>> {
    this.options.proxy = this.handleProxy()
    this.options.headers = options.headers || {}
    this.options.maxBodyLength = Infinity
    this.options.maxContentLength = Infinity
    if (this.options.proxy && options.url?.startsWith('https://')) {
      this.options.httpsAgent = tunnel.httpsOverHttp({
        proxy: {
          host: this.options.proxy.host,
          port: this.options.proxy.port
        }
      })
      this.options.proxy = false
    } else {
      this.options.httpsAgent = httpsAgent
    }
    // !NOTICE this.options !== options
    // this.options is the default options
    const instance = axios.create(this.options)
    instance.interceptors.response.use(responseInterceptor, responseErrorHandler)

    // compatible with old request options to new options
    const opt = requestInterceptor(options)

    instance.interceptors.request.use(function (obj) {
      // handle Content-Type
      let contentType = ''
      if (obj?.headers?.contentType) {
        contentType = obj.headers.contentType as string
        delete obj.headers.contentType
      } else if (obj?.headers?.ContentType) {
        contentType = obj.headers.ContentType as string
        delete obj.headers.ContentType
      } else if (obj?.headers?.['content-type']) {
        contentType = obj.headers['content-type'] as string
        delete obj.headers['content-type']
      }
      if (contentType !== '' && obj.headers) {
        obj.headers['Content-Type'] = contentType
      }
      return obj
    })
    if ('resolveWithFullResponse' in options && options.resolveWithFullResponse) {
      return instance.request(opt)
    } else {
      return instance.request(opt).then(res => {
        // use old request option format
        if (opt.__isOldOptions) {
          if ('json' in options) {
            if (options.json) {
              return res.data
            }
          } else {
            return JSON.stringify(res.data)
          }
        } else {
          return res.data
        }
      }) as Promise<IResponse<T, U>>
    }
  }
}

export default Request
