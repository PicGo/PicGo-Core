import type { Command } from 'commander'
import type { IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { createImportProgressRenderer, printImportSummary, runCloudCommand } from './shared'

interface ICloudRetryOptions {
  verbose?: boolean
}

const registerCloudRetryCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('retry')
    .description('retry pending cloud album imports')
    .option('--verbose', 'print batch details instead of the progress bar')
    .action(async (options: ICloudRetryOptions) => {
      await runCloudCommand(ctx, async () => {
        const pendingItems = await ctx.cloud.album.getPending()
        if (pendingItems.length === 0) {
          console.log(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_NO_PENDING'))
          return
        }

        const progressRenderer = createImportProgressRenderer(ctx, options.verbose === true)
        try {
          const result = await ctx.cloud.album.retryPending()
          printImportSummary(ctx, result)
        } finally {
          progressRenderer.dispose()
        }
      })
    })
}

export { registerCloudRetryCommand }
