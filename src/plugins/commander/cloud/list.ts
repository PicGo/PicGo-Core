import type { Command } from 'commander'
import { AlbumListOrder, AlbumListSort, type AlbumListQuery, type IPicGo } from '../../../types'
import { compactObject, parseInteger, printJson, runCloudCommand } from './shared'

interface ICloudListOptions {
  contentType?: string
  type?: string
  ext?: string
  search?: string
  fileName?: string
  limit?: string
  offset?: string
  sort?: 'newest' | 'oldest' | 'fileName'
  order?: 'asc' | 'desc'
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
    .option('--type <type>', 'filter by type')
    .option('--ext <ext>', 'filter by extension')
    .option('--search <keyword>', 'filter by keyword')
    .option('--file-name <fileName>', 'filter by file name')
    .option('--limit <limit>', 'set the page size')
    .option('--offset <offset>', 'set the page offset')
    .option('--sort <field>', 'sort by newest, oldest, or fileName')
    .option('--order <order>', 'sort order: asc or desc')
}

const createCloudListAction = (ctx: IPicGo) => {
  return async (options: ICloudListOptions): Promise<void> => {
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

      const response = await ctx.cloud.album.list(query)
      for (const item of response.items) {
        console.log([item.id ?? '', item.fileName ?? '', item.imgUrl ?? ''].join('\t'))
      }
      printJson({
        total: response.total,
        limit: response.limit,
        offset: response.offset
      })
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
