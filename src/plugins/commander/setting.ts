import PicGo from '../../core/PicGo'

export default {
  handle: (ctx: PicGo) => {
    const cmd: typeof ctx.cmd = ctx.cmd
    cmd.program
      .command('set')
      .alias('config')
      .arguments('<module> [name]')
      .description('configure config of picgo modules')
      .action(async (module: string, name: string) => {
        try {
          // // load third-party plugins
          // await ctx.pluginLoader.load()
          // if a module is specific, then just set this option in config
          switch (module) {
            case 'uploader':
            case 'transformer':
              if (name) {
                const item = ctx.helper[module].get(name)
                if (!item) {
                  return ctx.log.error(`No ${module} named ${name}`)
                }
                if (item.handleConfig) {
                  await item.handleConfig(ctx)
                }
              } else {
                let prompts = [
                  {
                    type: 'list',
                    name: `${module}`,
                    choices: ctx.helper[module].getNameList(),
                    message: `Choose a(n) ${module}`,
                    default: ctx.config.picBed.uploader || ctx.config.picBed.current
                  }
                ]
                let answer = await ctx.cmd.inquirer.prompt(prompts)
                const item = ctx.helper[module].get(answer[module])
                if (item.handleConfig) {
                  await item.handleConfig(ctx)
                }
              }
              break
            case 'plugin':
              if (name) {
                if (!name.includes('picgo-plugin-')) {
                  name = `picgo-plugin-${name}`
                }
                if (Object.keys(ctx.config.plugins).includes(name)) {
                  if (ctx.pluginLoader.getPlugin(name).handleConfig) {
                    await ctx.pluginLoader.getPlugin(name).handleConfig(ctx)
                  }
                } else {
                  return ctx.log.error(`No plugin named ${name}`)
                }
              } else {
                let prompts = [
                  {
                    type: 'list',
                    name: 'plugin',
                    choices: ctx.pluginLoader.getList(),
                    message: `Choose a plugin`
                  }
                ]
                let answer = await ctx.cmd.inquirer.prompt(prompts)
                if (ctx.pluginLoader.getPlugin(answer['plugin']).handleConfig) {
                  await ctx.pluginLoader.getPlugin(answer['plugin']).handleConfig()
                }
              }
              break
            default:
              ctx.log.warn(`No module named ${module}`)
              return ctx.log.warn('Available modules are uploader|transformer|plugins')
          }
          ctx.log.success('Configure config successfully!')
        } catch (e) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            Promise.reject(e)
          }
        }
      })
  }
}
