import PicGo from '../../core/PicGo'
import { Plugin } from '../../utils/interfaces'

const proxy: Plugin = {
  handle: (ctx: PicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .option('-p, --proxy <url>', 'set proxy for uploading', (proxy: string) => {
        ctx.setConfig({
          'picBed.proxy': proxy
        })
        ctx.Request.init()
      })
  }
}

export default proxy
