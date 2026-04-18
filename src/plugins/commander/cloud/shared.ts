import ora from 'ora'
import type { Ora } from 'ora'
import type { CloudImportProgress, ImportResult, IPicGo, IStringKeyMap } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { IBuildInEvent } from '../../../utils/enum'

const createSpinner = (text: string): Ora => {
  return ora({ text }).start()
}

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

const PROGRESS_BAR_WIDTH = 20
const PROGRESS_FILLED = '█'
const PROGRESS_EMPTY = '░'

const renderProgressBar = (current: number, total: number): string => {
  const ratio = total > 0 ? current / total : 0
  const filled = Math.round(ratio * PROGRESS_BAR_WIDTH)
  const empty = PROGRESS_BAR_WIDTH - filled
  return PROGRESS_FILLED.repeat(filled) + PROGRESS_EMPTY.repeat(empty)
}

interface IImportProgressRenderer {
  spinner: Ora
  dispose: () => void
}

const createImportProgressRenderer = (ctx: IPicGo, verbose: boolean): IImportProgressRenderer => {
  const spinner = ora({ text: '' })

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

    if (verbose || !process.stdout.isTTY) {
      const line = ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_VERBOSE_BATCH', args)
      if (spinner.isSpinning) {
        spinner.stop()
      }
      console.log(line)
      return
    }

    const label = ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_PROGRESS_BAR', args)
    const bar = renderProgressBar(progress.current, progress.total)
    spinner.text = `${bar} ${label}`

    if (!spinner.isSpinning) {
      spinner.start()
    }
  }

  ctx.on(IBuildInEvent.CLOUD_IMPORT_PROGRESS, listener)

  return {
    spinner,
    dispose: () => {
      ctx.off(IBuildInEvent.CLOUD_IMPORT_PROGRESS, listener)
      if (spinner.isSpinning) {
        spinner.stop()
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

const printCompactJson = (value: unknown): void => {
  console.log(JSON.stringify(value))
}

export {
  compactObject,
  createImportProgressRenderer,
  createSpinner,
  ensureCloudLogin,
  parseInteger,
  printCompactJson,
  printImportSummary,
  printJson,
  runCloudCommand
}
