import type { Command } from 'commander'
import type { IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { createImportProgressRenderer, createSpinner, printCompactJson, printImportSummary, runCloudCommand } from './shared'

interface ICloudRetryOptions {
  verbose?: boolean
  format?: string
}

const registerCloudRetryCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('retry')
    .description('retry pending cloud album imports')
    .option('--verbose', 'print batch details instead of the progress bar')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
    .action(async (options: ICloudRetryOptions) => {
      await runCloudCommand(ctx, async () => {
        const loadingSpinner = createSpinner(
          ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_RETRY_LOADING_PENDING')
        )
        const pendingItems = await ctx.cloud.album.getPending()
        if (pendingItems.length === 0) {
          loadingSpinner.succeed(
            ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_NO_PENDING')
          )
          return
        }
        loadingSpinner.succeed(
          ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_RETRY_LOADING_PENDING_DONE', {
            count: String(pendingItems.length)
          })
        )

        const progressRenderer = createImportProgressRenderer(ctx, options.verbose === true)
        progressRenderer.spinner.text = ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_RETRY_UPLOADING')
        progressRenderer.spinner.start()
        try {
          const result = await ctx.cloud.album.retryPending()
          progressRenderer.spinner.succeed(
            ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_RETRY_UPLOADING_DONE')
          )
          if (options.format === 'json') {
            printCompactJson(result)
          } else {
            printImportSummary(ctx, result)
          }
        } catch (error) {
          progressRenderer.spinner.fail(error instanceof Error ? error.message : String(error))
          throw error
        } finally {
          progressRenderer.dispose()
        }
      })
    })
}

export { registerCloudRetryCommand }
