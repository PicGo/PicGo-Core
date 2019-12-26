import PicGo from '../../core/PicGo'

export default {
  handle: (ctx: PicGo): void => {
    const cmd: typeof ctx.cmd = ctx.cmd
    cmd.program
      .command('use')
      .arguments('[module]')
      .description('use modules of picgo')
      .action(async (module: string) => {
        try {
          // // load third-party plugins
          // await ctx.pluginLoader.load()
          let prompts = []
          const config = {
            uploader: {
              type: 'list',
              name: 'uploader',
              message: 'Use an uploader',
              choices: ctx.helper.uploader.getIdList(),
              default: ctx.getConfig('picBed.uploader') || ctx.getConfig('picBed.current') || 'smms'
            },
            transformer: {
              type: 'list',
              name: 'transformer',
              message: 'Use a transformer',
              choices: ctx.helper.transformer.getIdList(),
              default: ctx.getConfig('picBed.transformer') || 'path'
            },
            plugins: {
              type: 'checkbox',
              name: 'plugins',
              message: 'Use plugins',
              choices: ctx.pluginLoader.getList(),
              default: Object.keys(ctx.getConfig('picgoPlugins')).filter((item: string) => ctx.getConfig(`picgoPlugins.${item}`))
            }
          }
          // if an option is specific, then just set this option in config
          if (module) {
            if (config[module]) {
              prompts.push(config[module])
            } else {
              ctx.log.warn(`No module named ${module}`)
              return ctx.log.warn('Available modules are uploader|transformer|plugins')
            }
          } else {
            prompts = Object.keys(config).map((item: string) => config[item])
          }
          const answer = await cmd.inquirer.prompt(prompts)

          // handle for plugins option from Array to object
          if (answer['plugins']) {
            let plugins = ctx.getConfig('picgoPlugins')
            Object.keys(plugins).map((item: string) => {
              if (answer['plugins'].includes(item)) {
                plugins[item] = true
              } else {
                plugins[item] = false
              }
            })
            // save config for plugins
            ctx.saveConfig({
              picgoPlugins: plugins
            })
          }
          // save config for uploader & transformer
          ctx.saveConfig({
            'picBed.current': answer['uploader'] || ctx.getConfig('picBed.current'),
            'picBed.uploader': answer['uploader'] || ctx.getConfig('picBed.current'),
            'picBed.transformer': answer['transformer'] || 'path'
          })
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
