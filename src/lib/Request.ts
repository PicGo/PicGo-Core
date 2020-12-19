import PicGo from '../core/PicGo'
import request, { RequestPromiseOptions, RequestPromiseAPI } from 'request-promise-native'
import { Undefinable } from 'src/types'

class Request {
  ctx: PicGo
  request!: RequestPromiseAPI
  constructor (ctx: PicGo) {
    this.ctx = ctx
    this.init()
  }

  init (): void {
    const options: RequestPromiseOptions = {
      jar: request.jar()
    }
    const proxy = this.ctx.getConfig<Undefinable<string>>('picBed.proxy')
    if (proxy) {
      options.proxy = proxy
    }
    this.request = request.defaults(options)
  }
}

export default Request
