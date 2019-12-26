import PicGo from '../../core/PicGo'
import { PluginConfig } from '../../utils/interfaces'

// handle modules config -> save to picgo config file
const handleConfig = async (ctx: PicGo, prompts: PluginConfig, module: string, name: string): Promise<void> => {
  const answer = await ctx.cmd.inquirer.prompt(prompts)
  let configName = module === 'uploader' ?
                    `picBed.${name}` : module === 'transformer' ?
                    `transformer.${name}` : name
  ctx.saveConfig({
    [configName]: answer
  })
}

export default {
  handle: (ctx: PicGo): void => {
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
                if (item.config) {
                  await handleConfig(ctx, item.config(ctx), module, name)
                }
              } else {
                let prompts = [
                  {
                    type: 'list',
                    name: `${module}`,
                    choices: ctx.helper[module].getIdList(),
                    message: `Choose a(n) ${module}`,
                    default: ctx.getConfig('picBed.uploader') || ctx.getConfig('picBed.current')
                  }
                ]
                let answer = await ctx.cmd.inquirer.prompt(prompts)
                const item = ctx.helper[module].get(answer[module])
                if (item.config) {
                  await handleConfig(ctx, item.config(ctx), module, answer[module])
                }
              }
              break
            case 'plugin':
              if (name) {
                if (!name.includes('picgo-plugin-')) {
                  name = `picgo-plugin-${name}`
                }
                if (Object.keys(ctx.getConfig('picgoPlugins')).includes(name)) {
                  if (ctx.pluginLoader.getPlugin(name).config) {
                    await handleConfig(ctx, ctx.pluginLoader.getPlugin(name).config(ctx), 'plugin', name)
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
                if (ctx.pluginLoader.getPlugin(answer['plugin']).config) {
                  await handleConfig(ctx, ctx.pluginLoader.getPlugin(answer['plugin']).config(ctx), 'plugin', answer['plugin'])
                }
              }
              break
            default:
              ctx.log.warn(`No module named ${module}`)
              return ctx.log.warn('Available modules are uploader|transformer|plugin')
          }
          ctx.log.success('Configure config successfully!')
        } catch (e) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })
  }
}
