import type { IPicGo, IPlugin } from '../../types'
import { createLogoutAction } from './cloud/actions'

const logout: IPlugin = {
  handle: (ctx: IPicGo) => {
    ctx.cmd.program
      .command('logout')
      .description('logout from cloud.picgo.app (shortcut for cloud logout)')
      .action(createLogoutAction(ctx))
  }
}

export { logout }
