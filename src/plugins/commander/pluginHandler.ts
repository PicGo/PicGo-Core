import PicGo from '../../core/PicGo'
import { IPlugin } from '../../utils/interfaces'

const pluginHandler: IPlugin = {
  handle: (ctx: PicGo) => {
    // const pluginHandler = new PluginHandler(ctx)
    const cmd = ctx.cmd
    cmd.program
      .command('install <plugins...>')
      .description('install picgo plugin')
      .alias('add')
      .option('-p, --proxy <proxy>', 'Add proxy for installing')
      .action((plugins: string[], program: any) => {
        ctx.pluginHandler.install(plugins, program.proxy).catch((e) => { this.ctx.log.error(e) })
      })
    cmd.program
      .command('uninstall <plugins...>')
      .alias('rm')
      .description('uninstall picgo plugin')
      .action((plugins: string[]) => {
        ctx.pluginHandler.uninstall(plugins).catch((e) => { this.ctx.log.error(e) })
      })
    cmd.program
      .command('update <plugins...>')
      .description('update picgo plugin')
      .action((plugins: string[]) => {
        ctx.pluginHandler.update(plugins).catch((e) => { this.ctx.log.error(e) })
      })
  }
}

export default pluginHandler
