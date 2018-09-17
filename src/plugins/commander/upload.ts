import PicGo from '../../core/PicGo'
import path from 'path'
import fs from 'fs-extra'

export default {
  handle: (ctx: PicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('upload')
      .description('upload, go go go')
      .arguments('<input...>')
      .alias('u')
      .action(async (input: string[]) => {
        const inputList = input
          .map(item => path.resolve(item))
          .filter(item => {
            const exist = fs.existsSync(item)
            if (!exist) {
              ctx.log.warn(`${item} is not existed.`)
            }
            return exist
          })
        if (inputList.length > 0) {
          await ctx.upload(inputList)
        } else {
          ctx.log.warn('No file to upload')
        }
      })
  }
}
