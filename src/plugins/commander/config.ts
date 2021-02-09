import { IPicGo, IPlugin } from '../../types'

const config: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .option('-c, --config <path>', 'set config path')
      // will handle in `bin/picgo`
  }
}

export default config
