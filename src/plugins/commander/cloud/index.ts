import type { IPicGo, IPlugin } from '../../../types'
import { applyConfigSyncOptions, createConfigSyncAction, createLoginAction, createLogoutAction } from './actions'
import { registerCloudDeleteCommand } from './delete'
import { registerCloudGetCommand } from './get'
import { applyCloudImportOptions, createCloudImportAction, registerCloudImportCommand } from './import'
import { applyCloudListOptions, createCloudListAction, registerCloudListCommand } from './list'
import { registerCloudRetryCommand } from './retry'
import { registerCloudUpdateCommand } from './update'

const cloud: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cloudCommand = ctx.cmd.program
      .command('cloud')
      .description('manage PicGo Cloud')

    // cloud login / cloud logout
    cloudCommand
      .command('login')
      .description('login to cloud.picgo.app (alias: picgo login)')
      .arguments('[token]')
      .action(createLoginAction(ctx))

    cloudCommand
      .command('logout')
      .description('logout from cloud.picgo.app (alias: picgo logout)')
      .action(createLogoutAction(ctx))

    // cloud album (canonical album commands)
    const albumCommand = cloudCommand
      .command('album')
      .description('manage cloud album data')

    registerCloudImportCommand(ctx, albumCommand)
    registerCloudListCommand(ctx, albumCommand)
    registerCloudGetCommand(ctx, albumCommand)
    registerCloudUpdateCommand(ctx, albumCommand)
    registerCloudDeleteCommand(ctx, albumCommand)
    registerCloudRetryCommand(ctx, albumCommand)

    // cloud config sync
    const cloudConfigCommand = cloudCommand
      .command('config')
      .description('manage cloud config')

    applyConfigSyncOptions(
      cloudConfigCommand
        .command('sync')
        .description('sync config with picgo cloud (alias: picgo config sync)')
    ).action(createConfigSyncAction(ctx))

    // aliases: cloud list -> cloud album list, cloud import -> cloud album import
    applyCloudListOptions(
      cloudCommand
        .command('list')
        .description('list cloud album items (shortcut for cloud album list)')
    ).action(createCloudListAction(ctx))

    applyCloudImportOptions(
      cloudCommand
        .command('import')
        .description('import local album data (shortcut for cloud album import)')
    ).action(createCloudImportAction(ctx))
  }
}

export { cloud }
