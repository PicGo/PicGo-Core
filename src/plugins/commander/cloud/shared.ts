import type { CloudImportProgress, ImportResult, IPicGo, IStringKeyMap } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { IBuildInEvent } from '../../../utils/enum'

const ensureCloudLogin = (ctx: IPicGo): void => {
  const token = ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
  if (!token) {
    throw new Error([
      ctx.i18n.translate<ILocalesKey>('CLOUD_COMMAND_LOGIN_REQUIRED'),
      ctx.i18n.translate<ILocalesKey>('CLOUD_COMMAND_LOGIN_HINT')
    ].join('\n'))
  }
}

const runCloudCommand = async (ctx: IPicGo, handler: () => Promise<void>): Promise<void> => {
  try {
    ensureCloudLogin(ctx)
    await handler()
  } catch (error: unknown) {
    ctx.log.error(error instanceof Error ? error : new Error(String(error)))
  }
}

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>
}

const parseInteger = (value?: string): number | undefined => {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const createImportProgressRenderer = (ctx: IPicGo, verbose: boolean): { dispose: () => void } => {
  let hasInlineOutput = false

  const listener = (progress: CloudImportProgress): void => {
    const args: IStringKeyMap<string> = {
      current: String(progress.current),
      total: String(progress.total),
      batchIndex: String(progress.batchIndex),
      batchTotal: String(progress.batchTotal),
      created: String(progress.created),
      skipped: String(progress.skipped),
      failed: String(progress.failed)
    }
    const line = verbose
      ? ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_VERBOSE_BATCH', args)
      : ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_PROGRESS_BAR', args)

    if (verbose || !process.stdout.isTTY) {
      console.log(line)
      return
    }

    hasInlineOutput = true
    process.stdout.write(`\r${line}`)

    if (progress.current >= progress.total) {
      process.stdout.write('\n')
      hasInlineOutput = false
    }
  }

  ctx.on(IBuildInEvent.CLOUD_IMPORT_PROGRESS, listener)

  return {
    dispose: () => {
      ctx.off(IBuildInEvent.CLOUD_IMPORT_PROGRESS, listener)
      if (hasInlineOutput) {
        process.stdout.write('\n')
      }
    }
  }
}

const printImportSummary = (ctx: IPicGo, result: ImportResult): void => {
  console.log(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_SUMMARY_TITLE'))
  const summaryRows: Array<[ILocalesKey, number]> = [
    ['CLOUD_ALBUM_IMPORT_SUMMARY_TOTAL', result.total],
    ['CLOUD_ALBUM_IMPORT_SUMMARY_CREATED', result.created],
    ['CLOUD_ALBUM_IMPORT_SUMMARY_SKIPPED', result.skipped],
    ['CLOUD_ALBUM_IMPORT_SUMMARY_INVALID', result.invalid],
    ['CLOUD_ALBUM_IMPORT_SUMMARY_FAILED', result.failed],
    ['CLOUD_ALBUM_IMPORT_SUMMARY_PENDING', result.pending]
  ]

  for (const [key, value] of summaryRows) {
    console.log(`${ctx.i18n.translate<ILocalesKey>(key)}: ${value}`)
  }

  if (result.pending > 0) {
    console.log(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_RETRY_HINT'))
  }
}

const printJson = (value: unknown): void => {
  console.log(JSON.stringify(value, null, 2))
}

export {
  compactObject,
  createImportProgressRenderer,
  ensureCloudLogin,
  parseInteger,
  printImportSummary,
  printJson,
  runCloudCommand
}
