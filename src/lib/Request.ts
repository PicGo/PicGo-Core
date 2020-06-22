import PicGo from '../core/PicGo'
import request, { RequestPromiseOptions } from 'request-promise-native'

class Request {
  ctx: PicGo
  request: typeof request
  constructor (ctx: PicGo) {
    this.ctx = ctx
    this.init()
  }

  init (): void {
    const options: RequestPromiseOptions = {
      jar: request.jar()
    }
    const proxy = this.ctx.getConfig<string>('picBed.proxy')
    if (proxy) {
      options.proxy = proxy
    }
    this.request = request.defaults(options)
  }
}

export default Request
