import type { Command } from 'commander'
import type { IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { createSpinner, printCompactJson, printJson, runCloudCommand } from './shared'

interface CloudGetOptions {
  format?: string
}

const registerCloudGetCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('get')
    .description('get one cloud album item')
    .argument('<id>')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
    .action(async (id: string, options: CloudGetOptions) => {
      await runCloudCommand(ctx, async () => {
        const spinner = createSpinner(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_GET_LOADING'))
        const item = await ctx.cloud.album.get(id)
        spinner.succeed(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_GET_DONE'))
        if (options.format === 'json') {
          printCompactJson(item)
        } else {
          printJson(item)
        }
      })
    })
}

export { registerCloudGetCommand }
