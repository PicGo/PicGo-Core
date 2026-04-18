import fs from 'fs-extra'
import path from 'path'
import { readFile } from 'node:fs/promises'
import type { Command } from 'commander'
import { DBStore } from '@picgo/store'
import { UserService } from '../../../lib/Cloud/services/UserService'
import type { Ora } from 'ora'
import type { IImgInfo, IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { createImportProgressRenderer, createSpinner, printCompactJson, printImportSummary, runCloudCommand } from './shared'

interface ICloudImportOptions {
  jsonFile?: string
  data?: string
  verbose?: boolean
  enableAutoImport?: boolean
  format?: string
}

interface IAutoImportAnswer {
  enableAutoImport: boolean
}

interface IImportSource {
  items: IImgInfo[]
  galleryStore?: DBStore
}

const applyCloudImportOptions = (cmd: Command): Command => {
  return cmd
    .argument('[dbPath]', 'path to the local PicGo gallery database, usually called picgo.db')
    .option('--json-file <path>', 'read import data from a JSON file')
    .option('--data <json>', 'read import data from an inline JSON string')
    .option('--verbose', 'print batch details instead of the progress bar')
    .option('--enable-auto-import', 'enable auto import before importing when needed')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
}

const createCloudImportAction = (ctx: IPicGo) => {
  return async (dbPath: string | undefined, options: ICloudImportOptions): Promise<void> => {
    await runCloudCommand(ctx, async () => {
      const loadingSpinner = createSpinner(
        ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_LOADING_SOURCE')
      )
      let source: IImportSource
      try {
        source = await loadImportSource(ctx, dbPath, options)
        loadingSpinner.succeed(
          ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_LOADING_SOURCE_DONE', {
            count: String(source.items.length)
          })
        )
      } catch (error) {
        loadingSpinner.fail(error instanceof Error ? error.message : String(error))
        throw error
      }

      const checkSpinner = createSpinner(
        ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_CHECKING_AUTO_IMPORT')
      )
      await ensureAutoImportEnabled(ctx, options.enableAutoImport === true, checkSpinner)

      const progressRenderer = createImportProgressRenderer(ctx, options.verbose === true)
      progressRenderer.spinner.text = ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_UPLOADING')
      progressRenderer.spinner.start()
      try {
        const result = await ctx.cloud.album.import(source.items)
        progressRenderer.spinner.succeed(
          ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_UPLOADING_DONE')
        )
        if (source.galleryStore) {
          await markImportedItems(source.galleryStore, result.items)
        }
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
  }
}

const registerCloudImportCommand = (ctx: IPicGo, parentCommand: Command): void => {
  applyCloudImportOptions(
    parentCommand
      .command('import')
      .description('import local album data into PicGo Cloud')
  ).action(createCloudImportAction(ctx))
}

const loadImportSource = async (ctx: IPicGo, dbPath: string | undefined, options: ICloudImportOptions): Promise<IImportSource> => {
  const importSources = [dbPath, options.jsonFile, options.data].filter((value): value is string => typeof value === 'string' && value.trim() !== '')

  if (importSources.length === 0) {
    throw new Error(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_SOURCE_REQUIRED'))
  }

  if (importSources.length > 1) {
    throw new Error(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_SOURCE_CONFLICT'))
  }

  if (typeof dbPath === 'string' && dbPath.trim() !== '') {
    return await loadItemsFromDb(ctx, dbPath)
  }

  if (typeof options.jsonFile === 'string' && options.jsonFile.trim() !== '') {
    return {
      items: await loadItemsFromJsonFile(ctx, options.jsonFile)
    }
  }

  return {
    items: parseImportItems(ctx, options.data ?? '')
  }
}

const loadItemsFromDb = async (ctx: IPicGo, dbPath: string): Promise<IImportSource> => {
  const resolvedPath = path.resolve(dbPath)
  if (!await fs.pathExists(resolvedPath)) {
    throw new Error(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_INVALID_JSON_FILE', {
      path: resolvedPath
    }))
  }

  const galleryStore = new DBStore(resolvedPath, 'gallery')
  const result = await galleryStore.get()
  return {
    galleryStore,
    items: (result.data as IImgInfo[]).filter(item => item._importToPicGoCloud !== true)
  }
}

const loadItemsFromJsonFile = async (ctx: IPicGo, jsonFile: string): Promise<IImgInfo[]> => {
  const resolvedPath = path.resolve(jsonFile)

  try {
    const content = await readFile(resolvedPath, 'utf8')
    return parseImportItems(ctx, content)
  } catch {
    throw new Error(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_INVALID_JSON_FILE', {
      path: resolvedPath
    }))
  }
}

const parseImportItems = (ctx: IPicGo, value: string): IImgInfo[] => {
  const invalidJsonMessage = ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_INVALID_JSON')
  let parsed: unknown

  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw new Error(invalidJsonMessage)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(invalidJsonMessage)
  }

  return parsed as IImgInfo[]
}

const markImportedItems = async (galleryStore: DBStore, items: IImgInfo[]): Promise<void> => {
  const importedIds = items
    .map(item => item.id)
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')

  if (importedIds.length === 0) {
    return
  }

  await galleryStore.updateMany(importedIds.map(id => ({
    id,
    _importToPicGoCloud: true
  })))
}

const ensureAutoImportEnabled = async (ctx: IPicGo, enableWithoutPrompt: boolean, spinner: Ora): Promise<void> => {
  const userInfo = await ctx.cloud.getUserInfo()
  if (userInfo?.autoImport) {
    spinner.succeed(
      ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_CHECKING_AUTO_IMPORT_DONE')
    )
    return
  }

  if (enableWithoutPrompt) {
    spinner.text = ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_ENABLING_AUTO_IMPORT')
    await enableAutoImport(ctx)
    spinner.succeed(
      ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_AUTO_IMPORT_ENABLED')
    )
    return
  }

  // Stop spinner before interactive prompt
  spinner.stop()

  const answer = await ctx.cmd.inquirer.prompt<IAutoImportAnswer>([{
    type: 'confirm',
    name: 'enableAutoImport',
    message: ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_PROMPT_ENABLE_AUTO_IMPORT'),
    default: true
  }])

  if (!answer.enableAutoImport) {
    throw new Error(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_AUTO_IMPORT_DISABLED'))
  }

  const enablingSpinner = createSpinner(
    ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_ENABLING_AUTO_IMPORT')
  )
  try {
    await enableAutoImport(ctx)
    enablingSpinner.succeed(
      ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_IMPORT_AUTO_IMPORT_ENABLED')
    )
  } catch (error) {
    enablingSpinner.fail(error instanceof Error ? error.message : String(error))
    throw error
  }
}

const enableAutoImport = async (ctx: IPicGo): Promise<void> => {
  const userService = new UserService(ctx)
  await userService.setAutoImport(true)
  await ctx.cloud.refreshUserInfo()
}

export { applyCloudImportOptions, createCloudImportAction, registerCloudImportCommand }
