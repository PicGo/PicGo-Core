import PicGo from '../../core/PicGo'

export default {
  handle: (ctx: PicGo): void => {
    const cmd: typeof ctx.cmd = ctx.cmd
    cmd.program
      .command('choose')
      .alias('ch')
      .arguments('[module]')
      .option('-l, --list', 'Display config')
      .description('choose modules of picgo')
      .action(async (module: string, list: any) => {
        try {
          if (list.list) {
            return console.log(ctx.config)
          }
          // // load third-party plugins
          // await ctx.pluginLoader.load()
          let prompts = []
          const config = {
            uploader: {
              type: 'list',
              name: 'uploader',
              message: 'Choose an uploader',
              choices: ctx.helper.uploader.getNameList(),
              default: ctx.config.picBed.uploader || ctx.config.picBed.current || 'smms'
            },
            transformer: {
              type: 'list',
              name: 'transformer',
              message: 'Choose a transformer',
              choices: ctx.helper.transformer.getNameList(),
              default: ctx.config.picBed.transformer || 'path'
            },
            plugins: {
              type: 'checkbox',
              name: 'plugins',
              message: 'Choose plugins',
              choices: ctx.pluginLoader.getList(),
              default: Object.keys(ctx.config.plugins).filter((item: string) => ctx.config.plugins[item])
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
            let plugins = ctx.getConfig('plugins')
            Object.keys(plugins).map((item: string) => {
              if (answer['plugins'].includes(item)) {
                plugins[item] = true
              } else {
                plugins[item] = false
              }
            })
            // save config for plugins
            ctx.saveConfig({
              plugins: plugins
            })
          }
          // save config for uploader & transformer
          ctx.saveConfig({
            'picBed.current': answer['uploader'] || ctx.config.picBed.current,
            'picBed.uploader': answer['uploader'] || ctx.config.picBed.current,
            'picBed.transformer': answer['transformer'] || 'path'
          })
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
