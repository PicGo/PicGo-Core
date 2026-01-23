import type { IPicGo, IPlugin } from '../../types'

const login: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('login')
      .description('login to cloud.picgo.app')
      .arguments('[token]')
      .action(async (token?: string) => {
        try {
          await ctx.cloud.login(token)
        } catch (e) {
          ctx.log.error(e as Error)
        }
      })
  }
}

export { login }
