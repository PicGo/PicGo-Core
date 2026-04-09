import type { Command } from 'commander'
import type { IImgInfo, IPicGo } from '../../../types'
import { compactObject, parseInteger, printJson, runCloudCommand } from './shared'

interface ICloudUpdateOptions {
  fileName?: string
  imgUrl?: string
  originImgUrl?: string
  contentType?: string
  width?: string
  height?: string
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
    .action(async (id: string, options: ICloudUpdateOptions) => {
      await runCloudCommand(ctx, async () => {
        const payload: Partial<IImgInfo> = compactObject({
          fileName: options.fileName,
          imgUrl: options.imgUrl,
          originImgUrl: options.originImgUrl,
          contentType: options.contentType,
          width: parseInteger(options.width),
          height: parseInteger(options.height)
        })

        const updatedItem = await ctx.cloud.album.update(id, payload)
        printJson(updatedItem)
      })
    })
}

export { registerCloudUpdateCommand }
