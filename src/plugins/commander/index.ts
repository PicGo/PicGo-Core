import pluginHandler from './pluginHandler'
import config from './config'
import upload from './upload'
import setting from './setting'
import use from './use'
import proxy from './proxy'
import init from './init'
import i18n from './i18n'
import { IPicGo } from '../../types'

export default (ctx: IPicGo): void => {
  ctx.cmd.register('pluginHandler', pluginHandler)
  ctx.cmd.register('config', config)
  ctx.cmd.register('setting', setting)
  ctx.cmd.register('upload', upload)
  ctx.cmd.register('use', use)
  ctx.cmd.register('proxy', proxy)
  ctx.cmd.register('init', init)
  ctx.cmd.register('i18n', i18n)
}
