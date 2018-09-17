import PicGo from '../../core/PicGo'
import pluginHandler from './pluginHandler'
import config from './config'
import upload from './upload'
import setting from './setting'
import chose from './choose'

export default (ctx: PicGo) => {
  ctx.cmd.register('pluginHandler', pluginHandler)
  ctx.cmd.register('config', config)
  ctx.cmd.register('setting', setting)
  ctx.cmd.register('upload', upload)
  ctx.cmd.register('chose', chose)
}
