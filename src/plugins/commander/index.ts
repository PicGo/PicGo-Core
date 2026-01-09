import pluginHandler from './pluginHandler'
import { configPath } from './configPath'
import upload from './upload'
import { config } from './config'
import { setting } from './setting'
import use from './use'
import proxy from './proxy'
import i18n from './i18n'
import { server } from './server'
import { login } from './login'
import { IPicGo } from '../../types'

const commanders = (ctx: IPicGo): void => {
  ctx.cmd.register('pluginHandler', pluginHandler)
  ctx.cmd.register('configPath', configPath)
  ctx.cmd.register('config', config)
  ctx.cmd.register('setting', setting)
  ctx.cmd.register('upload', upload)
  ctx.cmd.register('use', use)
  ctx.cmd.register('proxy', proxy)
  ctx.cmd.register('i18n', i18n)
  ctx.cmd.register('server', server)
  ctx.cmd.register('login', login)
}

export { commanders }
