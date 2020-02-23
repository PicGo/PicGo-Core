import PicGo from '../../core/PicGo'
import path from 'path'
import fs from 'fs-extra'
import { isUrl } from '../../utils/common'

export default {
  handle: (ctx: PicGo): void => {
    const cmd = ctx.cmd
    cmd.program
      .command('upload')
      .description('upload, go go go')
      .arguments('[input...]')
      .alias('u')
      .action(async (input: string[]) => {
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
        await ctx.upload(inputList)
      })
  }
}
