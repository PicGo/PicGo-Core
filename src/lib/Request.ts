import request, { RequestPromiseOptions, RequestPromiseAPI } from 'request-promise-native'
import { IPicGo, Undefinable, IConfigChangePayload, IConfig } from '../types'
import { CONFIG_CHANGE } from '../utils/buildInEvent'
import { eventBus } from '../utils/eventBus'

class Request {
  private readonly ctx: IPicGo
  private proxy: Undefinable<string> = ''
  options: RequestPromiseOptions = {}
  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.init()
    eventBus.on(CONFIG_CHANGE, (data: IConfigChangePayload<string | IConfig['picBed']>) => {
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

  // #64 dynamic get proxy value
  get request (): RequestPromiseAPI {
    // remove jar because we don't need anymore
    this.options.proxy = this.proxy || undefined
    return request.defaults(this.options)
  }
}

export default Request
