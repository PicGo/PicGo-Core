import PicGo from '../../core/PicGo'
import { IPlugin } from 'src/types'

const proxy: IPlugin = {
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
