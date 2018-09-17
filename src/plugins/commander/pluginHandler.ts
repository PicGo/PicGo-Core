import PicGo from '../../core/PicGo'
import PluginHandler from '../../lib/PluginHandler'

export default {
  handle: (ctx: PicGo) => {
    const pluginHandler = new PluginHandler(ctx)
    // const pluginHandler = new PluginHandler(ctx)
    const cmd = ctx.cmd
    cmd.program
      .command('install <plugins...>')
      .description('install picgo plugin')
      .alias('add')
      .action((plugins) => {
        pluginHandler.install(plugins)
      })
    cmd.program
      .command('uninstall <plugins...>')
      .alias('rm')
      .description('uninstall picgo plugin')
      .action((plugins) => {
        pluginHandler.uninstall(plugins)
      })
    cmd.program
      .command('update <plugins...>')
      .description('update picgo plugin')
      .action((plugins) => {
        pluginHandler.update(plugins)
      })
  }
}
