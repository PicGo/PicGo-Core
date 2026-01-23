import type { IPicGo, IPlugin } from '../../types'

const logout: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('logout')
      .description('logout from cloud.picgo.app')
      .action(async () => {
        try {
          ctx.cloud.logout()
        } catch (e) {
          ctx.log.error(e as Error)
        }
      })
  }
}

export { logout }
