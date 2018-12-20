import PicGo from '../../core/PicGo'

export default {
  handle: (ctx: PicGo): void => {
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
