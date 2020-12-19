import PicGo from '../../core/PicGo'
import { IPlugin } from 'src/types'

const config: IPlugin = {
  handle: (ctx: PicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .option('-c, --config <path>', 'set config path')
  }
}

export default config
