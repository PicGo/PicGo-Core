import PicGo from '../core/PicGo'
import request from 'request-promise-native'

class Request {
  ctx: PicGo
  request: typeof request
  constructor (ctx: PicGo) {
    this.ctx = ctx
    this.init()
  }

  init (): void {
    let options = {
      jar: request.jar()
    }
    if (this.ctx.config.picBed.proxy) {
      options['proxy'] = this.ctx.config.picBed.proxy
    }
    this.request = request.defaults(options)
  }
}

export default Request
