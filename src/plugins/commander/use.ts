import type { Question } from 'inquirer'
import { IPicGo, IPlugin, Undefinable, IStringKeyMap } from '../../types'

type UseModule = 'uploader' | 'transformer' | 'plugins'

type UseAnswers = {
  uploader?: string
  transformer?: string
  plugins?: string[]
}

type UploaderConfigAnswer = {
  uploaderConfigName: string
}

const use: IPlugin = {
  handle: async (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('use')
      .arguments('[module] [name] [configName]')
      .description('use a module (uploader/transformer/plugin) of picgo')
      .action(async (module?: string, name?: string, configName?: string) => {
        try {
          if (module === 'uploader' && name) {
            ctx.uploaderConfig.use(name, configName)
            ctx.log.success('Activated config successfully!')
            return
          }

          // // load third-party plugins
          // await ctx.pluginLoader.load()
          const modules: UseModule[] = ['uploader', 'transformer', 'plugins']
          let prompts: Array<Question<UseAnswers>> = []
          const config: Record<UseModule, Question<UseAnswers>> = {
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
              default: ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path'
            },
            plugins: {
              type: 'checkbox',
              name: 'plugins',
              message: 'Use plugins',
              choices: ctx.pluginLoader.getFullList(),
              default: Object.keys(ctx.getConfig('picgoPlugins')).filter((item: string) => ctx.getConfig(`picgoPlugins.${item}`))
            }
          }
          // if an option is specific, then just set this option in config
          if (module) {
            if (module === 'uploader' || module === 'transformer' || module === 'plugins') {
              prompts.push(config[module])
            } else {
              ctx.log.warn(`No module named ${module}`)
              return ctx.log.warn(`Available modules are ${modules.join('|')}`)
            }
          } else {
            prompts = modules.map((item: UseModule) => config[item])
          }
          const answer = await cmd.inquirer.prompt<UseAnswers>(prompts)

          // handle for plugins option from Array to object
          if (answer.plugins) {
            const enabledPlugins = answer.plugins
            const plugins = ctx.getConfig<IStringKeyMap<boolean>>('picgoPlugins')
            Object.keys(plugins).forEach((item: string) => {
              plugins[item] = enabledPlugins.includes(item)
            })
            // save config for plugins
            ctx.saveConfig({
              picgoPlugins: plugins
            })
          }

          if (answer.uploader) {
            const type = answer.uploader
            const list = ctx.uploaderConfig.getConfigList(type)
            if (list.length > 1) {
              const active = ctx.uploaderConfig.getActiveConfig(type)
              const configAnswer = await cmd.inquirer.prompt<UploaderConfigAnswer>([
                {
                  type: 'list',
                  name: 'uploaderConfigName',
                  message: 'Use an uploader config',
                  choices: list.map(item => item._configName),
                  default: active?._configName
                }
              ])
              ctx.uploaderConfig.use(type, configAnswer.uploaderConfigName)
            } else {
              ctx.uploaderConfig.use(type)
            }
          }

          if (typeof answer.transformer !== 'undefined') {
            ctx.saveConfig({
              'picBed.transformer': answer.transformer || 'path'
            })
          }
          ctx.log.success('Configure config successfully!')
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })
  }
}

export default use
