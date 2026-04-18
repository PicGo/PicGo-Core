import path from 'path'
import fs from 'fs-extra'
import { isUrl } from '../../utils/common'
import { IPicGo, IPlugin, OutputFormat } from '../../types'

interface UploadCommandOptions {
  format?: string
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
      .action(async (input: string[], options: UploadCommandOptions) => {
        try {
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
          await ctx.upload(inputList, {
            outputFormat: options.format === 'json' ? OutputFormat.JSON : OutputFormat.PRETTY
          })
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })
  }
}

export default upload
