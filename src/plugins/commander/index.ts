import PicGo from '../../core/PicGo'
import pluginHandler from './pluginHandler'
import config from './config'
import upload from './upload'
import setting from './setting'
import choose from './choose'

export default (ctx: PicGo): void => {
  ctx.cmd.register('pluginHandler', pluginHandler)
  ctx.cmd.register('config', config)
  ctx.cmd.register('setting', setting)
  ctx.cmd.register('upload', upload)
  ctx.cmd.register('choose', choose)
}
