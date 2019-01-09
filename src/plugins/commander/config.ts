import PicGo from '../../core/PicGo'

export default {
  handle: (ctx: PicGo): void => {
    const cmd = ctx.cmd
    cmd.program
      .option('-c, --config <path>', 'set config path')
  }
}
