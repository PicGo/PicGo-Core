import type { Command } from 'commander'
import type { IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { printJson, runCloudCommand } from './shared'

interface ICloudDeleteOptions {
  force?: boolean
}

interface ICloudDeleteAnswer {
  confirm: boolean
}

const registerCloudDeleteCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('delete')
    .description('delete cloud album items')
    .argument('<id...>')
    .option('--force', 'skip the confirmation prompt')
    .action(async (ids: string[], options: ICloudDeleteOptions) => {
      await runCloudCommand(ctx, async () => {
        if (options.force !== true) {
          const answer = await ctx.cmd.inquirer.prompt<ICloudDeleteAnswer>([{
            type: 'confirm',
            name: 'confirm',
            message: ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_DELETE_CONFIRM', {
              count: String(ids.length)
            }),
            default: false
          }])

          if (!answer.confirm) {
            return
          }
        }

        await ctx.cloud.album.delete(ids.length === 1 ? ids[0] : ids)
        printJson({
          deleted: ids
        })
      })
    })
}

export { registerCloudDeleteCommand }
