import type { IPicGo, IPlugin } from '../../types'
import { createLoginAction } from './cloud/actions'

const login: IPlugin = {
  handle: (ctx: IPicGo) => {
    ctx.cmd.program
      .command('login')
      .description('login to cloud.picgo.app (shortcut for cloud login)')
      .arguments('[token]')
      .action(createLoginAction(ctx))
  }
}

export { login }
