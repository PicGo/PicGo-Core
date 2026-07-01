import type { Command } from 'commander'
import { AlbumListOrder, AlbumListSort, type AlbumListQuery, type IImgInfo, type IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { compactObject, createSpinner, parseInteger, printCompactJson, runCloudCommand } from './shared'

interface CloudListOptions {
  contentType?: string
  type?: string
  ext?: string
  search?: string
  fileName?: string
  limit?: string
  offset?: string
  sort?: 'newest' | 'oldest' | 'fileName'
  order?: 'asc' | 'desc'
  format?: string
}

const ORDER_MAP: Record<'asc' | 'desc', AlbumListOrder> = {
  asc: AlbumListOrder.ASC,
  desc: AlbumListOrder.DESC
}

const SORT_MAP: Record<'newest' | 'oldest' | 'fileName', AlbumListSort> = {
  newest: AlbumListSort.NEWEST,
  oldest: AlbumListSort.OLDEST,
  fileName: AlbumListSort.FILE_NAME
}

const applyCloudListOptions = (cmd: Command): Command => {
  return cmd
    .option('--content-type <contentType>', 'filter by content type')
    .option('--type <uploader-type>', 'filter by uploader type. For example: "picgo-cloud", "smms", "imgur"')
    .option('--ext <ext>', 'filter by extension')
    .option('--search <keyword>', 'filter by keyword')
    .option('--file-name <fileName>', 'filter by file name')
    .option('--limit <limit>', 'set the page size')
    .option('--offset <offset>', 'set the page offset')
    .option('--sort <field>', 'sort by newest, oldest, or fileName')
    .option('--order <order>', 'sort order: asc or desc')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
}

const resolveItemUrl = (item: IImgInfo): string => {
  const url = (item as Record<string, unknown>).url
  if (typeof url === 'string' && url.trim() !== '') {
    return url
  }
  return item.imgUrl ?? ''
}

const createCloudListAction = (ctx: IPicGo) => {
  return async (options: CloudListOptions): Promise<void> => {
    await runCloudCommand(ctx, async () => {
      const query: AlbumListQuery = compactObject({
        contentType: options.contentType,
        type: options.type,
        ext: options.ext,
        search: options.search,
        fileName: options.fileName,
        limit: parseInteger(options.limit),
        offset: parseInteger(options.offset),
        sort: normalizeSort(options.sort),
        order: normalizeOrder(options.order)
      })

      const spinner = createSpinner(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_LIST_LOADING'))
      const response = await ctx.cloud.album.list(query)
      spinner.succeed(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_LIST_DONE'))

      if (options.format === 'json') {
        printCompactJson(response)
        return
      }

      const idWidth = Math.max('ID'.length, ...response.items.map(item => (item.id ?? '').length))
      console.log(`${'ID'.padEnd(idWidth)}  URL`)
      for (const item of response.items) {
        const id = (item.id ?? '').padEnd(idWidth)
        const url = resolveItemUrl(item)
        console.log(`${id}  ${url}`)
      }
      console.log(`\nTotal: ${response.total}  Limit: ${response.limit}  Offset: ${response.offset}`)
    })
  }
}

const registerCloudListCommand = (ctx: IPicGo, parentCommand: Command): void => {
  applyCloudListOptions(
    parentCommand
      .command('list')
      .description('list cloud album items')
  ).action(createCloudListAction(ctx))
}

const normalizeOrder = (value?: 'asc' | 'desc'): AlbumListOrder | undefined => {
  return value ? ORDER_MAP[value] : undefined
}

const normalizeSort = (value?: 'newest' | 'oldest' | 'fileName'): AlbumListSort | undefined => {
  return value ? SORT_MAP[value] : undefined
}

export { applyCloudListOptions, createCloudListAction, registerCloudListCommand }
