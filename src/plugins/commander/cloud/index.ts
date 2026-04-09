import type { IPicGo, IPlugin } from '../../../types'
import { registerCloudDeleteCommand } from './delete'
import { registerCloudGetCommand } from './get'
import { registerCloudImportCommand } from './import'
import { registerCloudListCommand } from './list'
import { registerCloudRetryCommand } from './retry'
import { registerCloudUpdateCommand } from './update'

const cloud: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cloudCommand = ctx.cmd.program
      .command('cloud')
      .description('manage PicGo Cloud album')

    registerCloudImportCommand(ctx, cloudCommand)
    registerCloudListCommand(ctx, cloudCommand)
    registerCloudGetCommand(ctx, cloudCommand)
    registerCloudUpdateCommand(ctx, cloudCommand)
    registerCloudDeleteCommand(ctx, cloudCommand)
    registerCloudRetryCommand(ctx, cloudCommand)
  }
}

export { cloud }
