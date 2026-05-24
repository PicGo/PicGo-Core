import path from 'path'
import fs from 'fs-extra'
import { isUrl } from '../../utils/common'
import { IPicGo, IPlugin, OutputFormat, IFileUploadProgress, IStringKeyMap } from '../../types'
import type { ILocalesKey } from '../../i18n/zh-CN'
import { IBuildInEvent } from '../../utils/enum'
import { BYTES_PER_MB } from '../../utils/static'
import { createProgressRenderer } from './utils/progressRenderer'

interface UploadCommandOptions {
  format?: string
  verbose?: boolean
}

const formatMB = (bytes: number): string => (bytes / BYTES_PER_MB).toFixed(1)

const buildFileUploadArgs = (ctx: IPicGo, payload: IFileUploadProgress): IStringKeyMap<string> => {
  const resumedSuffix = payload.resumed
    ? ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_RESUMED_SUFFIX')
    : ''
  return {
    fileName: payload.fileName,
    loadedMB: formatMB(payload.current),
    totalMB: formatMB(payload.total),
    partsCompleted: String(payload.partsCompleted),
    totalParts: String(payload.totalParts),
    resumedSuffix
  }
}

const upload: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('upload')
      .description('upload, go go go')
      .arguments('[input...]')
      .alias('u')
      .option('--format <format>', 'output format: pretty | json', 'pretty')
      .option('--verbose', 'print per-event progress lines instead of a spinner', false)
      .action(async (input: string[], options: UploadCommandOptions) => {
        const inputList = input
          .map((item: string) => {
            return isUrl(item) ? item : path.resolve(item)
          })
          .filter((item: string) => {
            const exist = fs.existsSync(item) || isUrl(item)
            if (!exist) {
              ctx.log.warn(`${item} does not exist.`)
            }
            return exist
          })

        const renderer = createProgressRenderer<IFileUploadProgress>({
          ctx,
          event: IBuildInEvent.FILE_UPLOAD_PROGRESS,
          verbose: options.verbose === true,
          formatBarText: (payload) => {
            return ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_PROGRESS_BAR', buildFileUploadArgs(ctx, payload))
          },
          formatVerboseText: (payload) => {
            return ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_VERBOSE', buildFileUploadArgs(ctx, payload))
          }
        })

        try {
          await ctx.upload(inputList, {
            outputFormat: options.format === 'json' ? OutputFormat.JSON : OutputFormat.PRETTY
          })
        } catch (e: unknown) {
          ctx.log.error(e instanceof Error ? e : new Error(String(e)))
          if (process.argv.includes('--debug')) {
            throw e
          }
        } finally {
          renderer.dispose()
        }
      })
  }
}

export { upload }
