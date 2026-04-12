import type { IPicGo, IPlugin } from '../../types'
import { applyConfigSyncOptions, createConfigSyncAction } from './cloud/actions'

const config: IPlugin = {
  handle: (ctx: IPicGo) => {
    const configCommand = ctx.cmd.program
      .command('config')
      .description('manage picgo config')

    applyConfigSyncOptions(
      configCommand
        .command('sync')
        .description('sync config with picgo cloud (shortcut for cloud config sync)')
    ).action(createConfigSyncAction(ctx))
  }
}

export { config }
