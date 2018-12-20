import PicGo from '../../core/PicGo'
// import path from 'path'
// import fs from 'fs-extra'
// import { getConfig } from '../../utils/config'

export default {
  handle: (ctx: PicGo): void => {
    const cmd = ctx.cmd
    cmd.program
      .option('-c, --config <path>', 'set config path')
  }
}
