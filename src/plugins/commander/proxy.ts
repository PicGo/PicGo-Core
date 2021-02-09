import { IPicGo, IPlugin } from '../../types'

const proxy: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .option('-p, --proxy <url>', 'set proxy for uploading', (proxy: string) => {
        ctx.setConfig({
          'picBed.proxy': proxy
        })
      })
  }
}

export default proxy
