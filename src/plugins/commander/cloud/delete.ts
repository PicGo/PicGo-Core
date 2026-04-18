import type { Command } from 'commander'
import type { IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { createSpinner, printCompactJson, printJson, runCloudCommand } from './shared'

interface CloudDeleteOptions {
  force?: boolean
  format?: string
}

interface CloudDeleteAnswer {
  confirm: boolean
}

const registerCloudDeleteCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('delete')
    .description('delete cloud album items')
    .argument('<id...>')
    .option('--force', 'skip the confirmation prompt')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
    .action(async (ids: string[], options: CloudDeleteOptions) => {
      await runCloudCommand(ctx, async () => {
        if (options.force !== true) {
          const answer = await ctx.cmd.inquirer.prompt<CloudDeleteAnswer>([{
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

        const spinner = createSpinner(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_DELETE_LOADING'))
        await ctx.cloud.album.delete(ids.length === 1 ? ids[0] : ids)
        spinner.succeed(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_DELETE_DONE'))
        const result = { deleted: ids }
        if (options.format === 'json') {
          printCompactJson(result)
        } else {
          printJson(result)
        }
      })
    })
}

export { registerCloudDeleteCommand }
