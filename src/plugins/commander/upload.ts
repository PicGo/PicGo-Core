import path from 'path'
import fs from 'fs-extra'
import { isUrl } from '../../utils/common'
import { normalizeWslPath } from '../../utils/normalizeWslPath'
import { IPicGo, IPlugin, OutputFormat, IFileUploadProgress, IStringKeyMap, IImgInfo, LogConsoleStream } from '../../types'
import type { ILocalesKey } from '../../i18n/zh-CN'
import { IBuildInEvent } from '../../utils/enum'
import { BYTES_PER_MB } from '../../utils/static'
import { createProgressRenderer } from './utils/progressRenderer'

interface UploadCommandOptions {
  format?: string
  verbose?: boolean
  uploader?: string
  configName?: string
  configId?: string
}

const formatMB = (bytes: number): string => (bytes / BYTES_PER_MB).toFixed(1)

const resolveUploadInput = (item: string): string => {
  const normalizedItem = normalizeWslPath(item)
  return isUrl(normalizedItem) ? normalizedItem : path.resolve(normalizedItem)
}

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

interface UploadJsonResultItem {
  imgUrl?: string
  origin?: string
  fileName?: string
  type?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  extname?: string
}

const toJsonResultItem = (item: IImgInfo): UploadJsonResultItem => ({
  imgUrl: item.imgUrl,
  origin: item.origin,
  fileName: item.fileName,
  type: item.type,
  contentType: item.contentType,
  size: item.size,
  width: item.width,
  height: item.height,
  extname: item.extname
})

const hasImgUrl = (item: IImgInfo): boolean => typeof item.imgUrl === 'string' && item.imgUrl !== ''

// Collapse to one line so the json-mode failure reason on stderr stays a single, greppable line.
const toErrorReason = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/\s*\n\s*/g, ' ').trim()
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
      .option('--uploader <type>', 'uploader type to use')
      .option('--configName <name>', 'uploader configuration name to use')
      .option('--configId <id>', 'uploader configuration ID to use')
      .option(
        '--verbose',
        'Force per-event progress lines (one console.log per progress tick) instead of an in-place spinner. ' +
        'Non-TTY stdout (pipes, CI) automatically falls back to this mode regardless of the flag — ' +
        '--verbose is for the niche case of wanting line-by-line history on an interactive TTY ' +
        '(debugging multipart retries, AI agents tailing output, etc.).',
        false
      )
      .action(async (input: string[], options: UploadCommandOptions) => {
        const isJson = options.format === OutputFormat.JSON
        const originalLog = ctx.log
        if (isJson) {
          // stdout is reserved for the single result line; route this command's logs to stderr (the log file is still
          // written as usual). Restored in `finally`.
          const stderrLogger = ctx.log.createLogger?.({ consoleStream: LogConsoleStream.STDERR })
          if (stderrLogger) {
            ctx.log = stderrLogger
          }
        }

        // Lifecycle swallows upload errors (the SDK/GUI rely on that) but emits FAILED, so keep the last one around
        // to explain a json-mode failure on stderr.
        let lastError: unknown
        const onFailed = (e: unknown): void => {
          lastError = e
        }
        ctx.on(IBuildInEvent.FAILED, onFailed)

        const reportFailure = (message: string): void => {
          process.exitCode = 1
          if (isJson) {
            console.error(message)
          } else {
            ctx.log.error(message)
          }
        }

        const renderer = createProgressRenderer<IFileUploadProgress>({
          ctx,
          event: IBuildInEvent.FILE_UPLOAD_PROGRESS,
          verbose: options.verbose === true,
          lineStream: isJson ? LogConsoleStream.STDERR : LogConsoleStream.STDOUT,
          formatBarText: (payload) => {
            return ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_PROGRESS_BAR', buildFileUploadArgs(ctx, payload))
          },
          formatVerboseText: (payload) => {
            return ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_VERBOSE', buildFileUploadArgs(ctx, payload))
          }
        })

        try {
          const inputList = input
            .map(resolveUploadInput)
            .filter((item: string) => {
              const exist = fs.existsSync(item) || isUrl(item)
              if (!exist) {
                ctx.log.warn(ctx.i18n.translate<ILocalesKey>('CLI_UPLOAD_INPUT_NOT_EXIST', { path: item }))
              }
              return exist
            })
          const hasMissingInput = inputList.length < input.length

          // Explicit inputs that all turned out to be missing must never fall back to a clipboard upload.
          if (input.length > 0 && inputList.length === 0) {
            reportFailure(ctx.i18n.translate<ILocalesKey>('CLI_UPLOAD_NO_VALID_INPUT'))
            return
          }

          let result: IImgInfo[] | Error
          try {
            result = await ctx.upload(inputList, {
              outputFormat: isJson ? OutputFormat.JSON : OutputFormat.PRETTY,
              uploader: options.uploader,
              configName: options.configName,
              configId: options.configId
            })
          } catch (e: unknown) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)))
            process.exitCode = 1
            if (isJson) {
              console.error(ctx.i18n.translate<ILocalesKey>('CLI_UPLOAD_FAILED', { reason: toErrorReason(e) }))
            }
            if (process.argv.includes('--debug')) {
              throw e
            }
            return
          }

          const items = Array.isArray(result) ? result : []
          const succeededCount = items.filter(hasImgUrl).length
          const allSucceeded = items.length > 0 && succeededCount === items.length

          if (isJson) {
            if (succeededCount > 0) {
              // Partial success still prints every item (failed ones have no imgUrl); the exit code reports the failure.
              console.log(JSON.stringify(items.map(toJsonResultItem)))
            } else {
              const reasonSource = result instanceof Error ? result : lastError
              const reason = reasonSource === undefined
                ? ctx.i18n.translate<ILocalesKey>('CLI_UPLOAD_FAILED_NO_RESULT')
                : toErrorReason(reasonSource)
              console.error(ctx.i18n.translate<ILocalesKey>('CLI_UPLOAD_FAILED', { reason }))
            }
          }

          if (!allSucceeded || hasMissingInput) {
            process.exitCode = 1
          }
        } finally {
          renderer.dispose()
          ctx.off(IBuildInEvent.FAILED, onFailed)
          ctx.log = originalLog
        }
      })
  }
}

export { resolveUploadInput, upload }
