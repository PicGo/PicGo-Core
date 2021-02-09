import { IPicGo, IPlugin } from '../../types'

const pluginHandler: IPlugin = {
  handle: (ctx: IPicGo) => {
    // const pluginHandler = new PluginHandler(ctx)
    const cmd = ctx.cmd
    cmd.program
      .command('install <plugins...>')
      .description('install picgo plugin')
      .alias('add')
      .option('-p, --proxy <proxy>', 'Add proxy for installing')
      .option('-r, --registry <registry>', 'Choose a registry for installing')
      .action((plugins: string[], program: any) => {
        const { proxy, registry } = program
        const options = {
          proxy,
          registry
        }
        ctx.pluginHandler.install(plugins, options).catch((e) => { ctx.log.error(e) })
      })
    cmd.program
      .command('uninstall <plugins...>')
      .alias('rm')
      .description('uninstall picgo plugin')
      .action((plugins: string[]) => {
        ctx.pluginHandler.uninstall(plugins).catch((e) => { ctx.log.error(e) })
      })
    cmd.program
      .command('update <plugins...>')
      .description('update picgo plugin')
      .option('-p, --proxy <proxy>', 'Add proxy for installing')
      .option('-r, --registry <registry>', 'Choose a registry for installing')
      .action((plugins: string[], program: any) => {
        const { proxy, registry } = program
        const options = {
          proxy,
          registry
        }
        ctx.pluginHandler.update(plugins, options).catch((e: Error) => { ctx.log.error(e) })
      })
  }
}

export default pluginHandler
