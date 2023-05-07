import { IPicGo, IPluginConfig, IStringKeyMap } from '../../types'

// handle modules config -> save to picgo config file
const handleConfig = async (ctx: IPicGo, prompts: IPluginConfig[], module: string, name: string): Promise<void> => {
  const answer = await ctx.cmd.inquirer.prompt(prompts)
  const configName = module === 'uploader'
    ? `picBed.${name}` : module === 'transformer'
      ? `transformer.${name}` : name
  ctx.saveConfig({
    [configName]: answer
  })
  // auto set current uploader or transformer
  if (module === 'uploader') {
    ctx.saveConfig({
      'picBed.current': name,
      'picBed.uploader': name
    })
  } else if (module === 'transformer') {
    ctx.saveConfig({
      'picBed.transformer': name
    })
  }
}

const setting = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('set')
      .alias('config')
      .arguments('<module> [name]')
      .description('configure config of picgo modules')
      .action((module: string, name: string) => {
        (async () => {
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
                  const prompts = [
                    {
                      type: 'list',
                      name: `${module}`,
                      choices: ctx.helper[module].getIdList(),
                      message: `Choose a(n) ${module}`
                      // default: ctx.getConfig('picBed.uploader') || ctx.getConfig('picBed.current')
                    }
                  ]
                  const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<any>>(prompts)
                  const item = ctx.helper[module].get(answer[module])
                  if (item?.config) {
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
                    if (ctx.pluginLoader.getPlugin(name)?.config) {
                      await handleConfig(ctx, ctx.pluginLoader.getPlugin(name)!.config!(ctx), 'plugin', name)
                    }
                  } else {
                    return ctx.log.error(`No plugin named ${name}`)
                  }
                } else {
                  const prompts = [
                    {
                      type: 'list',
                      name: 'plugin',
                      choices: ctx.pluginLoader.getFullList(),
                      message: 'Choose a plugin'
                    }
                  ]
                  const answer = await ctx.cmd.inquirer.prompt<any>(prompts)
                  if (ctx.pluginLoader.getPlugin(answer.plugin)?.config) {
                    await handleConfig(ctx, ctx.pluginLoader.getPlugin(answer.plugin)!.config!(ctx), 'plugin', answer.plugin)
                  }
                }
                break
              default:
                ctx.log.warn(`No module named ${module}`)
                return ctx.log.warn('Available modules are uploader|transformer|plugin')
            }
            ctx.log.success('Configure config successfully!')
            if (module === 'plugin') {
              ctx.log.info('If you want to use this config, please run \'picgo use plugins\'')
            }
          } catch (e: any) {
            ctx.log.error(e)
            if (process.argv.includes('--debug')) {
              throw e
            }
          }
        })().catch((e) => { ctx.log.error(e) })
      })
  }
}

export default setting
