import PicGo from '../../core/PicGo'
import { Plugin } from '../../utils/interfaces'

const config: Plugin = {
  handle: (ctx: PicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .option('-c, --config <path>', 'set config path')
  }
}

export default config
