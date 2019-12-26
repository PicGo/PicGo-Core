import PicGo from '../../core/PicGo'

export default {
  handle: (ctx: PicGo): void => {
    // const pluginHandler = new PluginHandler(ctx)
    const cmd = ctx.cmd
    cmd.program
      .command('install <plugins...>')
      .description('install picgo plugin')
      .alias('add')
      .option('-p, --proxy <proxy>', 'Add proxy for installing')
      .action((plugins: string[], program: any) => {
        return ctx.pluginHandler.install(plugins, program.proxy)
      })
    cmd.program
      .command('uninstall <plugins...>')
      .alias('rm')
      .description('uninstall picgo plugin')
      .action((plugins: string[]) => {
        return ctx.pluginHandler.uninstall(plugins)
      })
    cmd.program
      .command('update <plugins...>')
      .description('update picgo plugin')
      .action((plugins: string[]) => {
        return ctx.pluginHandler.update(plugins)
      })
  }
}
