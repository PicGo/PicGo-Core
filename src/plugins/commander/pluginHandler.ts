import PicGo from '../../core/PicGo'
import PluginHandler from '../../lib/PluginHandler'

export default {
  handle: (ctx: PicGo): void => {
    const pluginHandler = new PluginHandler(ctx)
    // const pluginHandler = new PluginHandler(ctx)
    const cmd = ctx.cmd
    cmd.program
      .command('install <plugins...>')
      .description('install picgo plugin')
      .alias('add')
      .action((plugins: string[]) => {
        pluginHandler.install(plugins)
      })
    cmd.program
      .command('uninstall <plugins...>')
      .alias('rm')
      .description('uninstall picgo plugin')
      .action((plugins: string[]) => {
        pluginHandler.uninstall(plugins)
      })
    cmd.program
      .command('update <plugins...>')
      .description('update picgo plugin')
      .action((plugins: string[]) => {
        pluginHandler.update(plugins)
      })
  }
}
