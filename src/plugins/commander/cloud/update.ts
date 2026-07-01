import type { Command } from 'commander'
import type { IImgInfo, IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { compactObject, createSpinner, parseInteger, printCompactJson, printJson, runCloudCommand } from './shared'

interface CloudUpdateOptions {
  fileName?: string
  imgUrl?: string
  originImgUrl?: string
  contentType?: string
  width?: string
  height?: string
  format?: string
}

const registerCloudUpdateCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('update')
    .description('update one cloud album item')
    .argument('<id>')
    .option('--fileName <fileName>', 'update the file name')
    .option('--imgUrl <imgUrl>', 'update the image url')
    .option('--originImgUrl <originImgUrl>', 'update the original image url')
    .option('--contentType <contentType>', 'update the content type')
    .option('--width <width>', 'update the width')
    .option('--height <height>', 'update the height')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
    .action(async (id: string, options: CloudUpdateOptions) => {
      await runCloudCommand(ctx, async () => {
        const payload: Partial<IImgInfo> = compactObject({
          fileName: options.fileName,
          imgUrl: options.imgUrl,
          originImgUrl: options.originImgUrl,
          contentType: options.contentType,
          width: parseInteger(options.width),
          height: parseInteger(options.height)
        })

        const spinner = createSpinner(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_UPDATE_LOADING'))
        const updatedItem = await ctx.cloud.album.update(id, payload)
        spinner.succeed(ctx.i18n.translate<ILocalesKey>('CLOUD_ALBUM_UPDATE_DONE'))
        if (options.format === 'json') {
          printCompactJson(updatedItem)
        } else {
          printJson(updatedItem)
        }
      })
    })
}

export { registerCloudUpdateCommand }
