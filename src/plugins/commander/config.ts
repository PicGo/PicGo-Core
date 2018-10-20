import PicGo from '../../core/PicGo'
import path from 'path'
import fs from 'fs-extra'
import { getConfig } from '../../utils/config'

export default {
  handle: (ctx: PicGo): void => {
    const cmd = ctx.cmd
    cmd.program
      .option('-c, --config <path>', 'set config path', (configPath: string) => {
        configPath = path.resolve(configPath)
        if (!fs.existsSync(configPath)) {
          throw new Error('Config path doesn\'t exist!')
        }
        ctx.configPath = configPath
        ctx.baseDir = path.dirname(configPath)
        ctx.config = getConfig(configPath).read().value()
      })
  }
}
