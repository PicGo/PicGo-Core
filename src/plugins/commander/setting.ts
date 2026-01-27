import type { IPicGo, IPluginConfig, IStringKeyMap } from '../../types'

const normalizeName = (name: string): string => name.trim()
const toCompareName = (name: string): string => normalizeName(name).toLowerCase()

type ChooseUploaderAnswer = {
  uploaderType: string
}

type ChooseConfigAnswer = {
  configChoice: string
}

type CreateConfigAnswer = {
  newConfigName: string
}

type ChooseTransformerAnswer = {
  transformer: string
}

type ChoosePluginAnswer = {
  plugin: string
}

const findConfigName = (configNameList: string[], target: string): string | undefined => {
  const normalized = toCompareName(target)
  return configNameList.find(name => toCompareName(name) === normalized)
}

// handle modules config -> save to picgo config file (non-uploader modules)
const handleConfig = async (ctx: IPicGo, prompts: IPluginConfig[], module: string, name: string): Promise<void> => {
  const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<unknown>>(prompts)
  const configName = module === 'transformer'
    ? `transformer.${name}` : name
  ctx.saveConfig({
    [configName]: answer
  })
  if (module === 'transformer') {
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
      .arguments('<module> [name] [configName]')
      .description('configure config of picgo modules (uploader/transformer/plugin)')
      .action(async (module: string, name?: string, configName?: string) => {
        try {
          // // load third-party plugins
          // await ctx.pluginLoader.load()
          // if a module is specific, then just set this option in config
          switch (module) {
            case 'uploader':
              {
                const uploaderType = name || (await ctx.cmd.inquirer.prompt<ChooseUploaderAnswer>([
                  {
                    type: 'list',
                    name: 'uploaderType',
                    choices: ctx.helper.uploader.getIdList(),
                    message: 'Choose an uploader',
                    default: ctx.getConfig('picBed.uploader') || ctx.getConfig('picBed.current') || 'smms'
                  }
                ])).uploaderType

                const item = ctx.helper.uploader.get(uploaderType)
                if (!item) {
                  return ctx.log.error(`No uploader named ${uploaderType}`)
                }
                if (!item.config) {
                  return ctx.log.error(`Uploader ${uploaderType} has no config`)
                }

                const list = ctx.uploaderConfig.getConfigList(uploaderType)
                const nameList = list.map(cfg => cfg._configName)

                let finalConfigName = typeof configName === 'string' ? normalizeName(configName) : ''

                if (!finalConfigName) {
                  if (nameList.length > 0) {
                    const choiceAnswer = await ctx.cmd.inquirer.prompt<ChooseConfigAnswer>([
                      {
                        type: 'list',
                        name: 'configChoice',
                        message: 'Choose a config',
                        choices: [
                          { name: '[Create New Config]', value: '__CREATE__' },
                          ...nameList
                        ]
                      }
                    ])
                    if (choiceAnswer.configChoice === '__CREATE__') {
                      const createAnswer = await ctx.cmd.inquirer.prompt<CreateConfigAnswer>([
                        {
                          type: 'input',
                          name: 'newConfigName',
                          message: 'Enter config name',
                          validate: (input: string) => {
                            const trimmed = normalizeName(input)
                            if (!trimmed) return 'Config name can not be empty'
                            if (findConfigName(nameList, trimmed)) return `Config name ${trimmed} already exists`
                            return true
                          }
                        }
                      ])
                      finalConfigName = normalizeName(createAnswer.newConfigName)
                    } else {
                      finalConfigName = String(choiceAnswer.configChoice)
                    }
                  } else {
                    const createAnswer = await ctx.cmd.inquirer.prompt<CreateConfigAnswer>([
                      {
                        type: 'input',
                        name: 'newConfigName',
                        message: 'Enter config name',
                        validate: (input: string) => {
                          const trimmed = normalizeName(input)
                          if (!trimmed) return 'Config name can not be empty'
                          return true
                        }
                      }
                    ])
                    finalConfigName = normalizeName(createAnswer.newConfigName)
                  }
                }

                const existing = findConfigName(nameList, finalConfigName)
                if (existing) {
                  const existingConfig = list.find(cfg => toCompareName(cfg._configName) === toCompareName(existing))
                  if (existingConfig) {
                    ctx.setConfig({
                      [`picBed.${uploaderType}`]: existingConfig
                    })
                  }
                }

                const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<unknown>>(item.config(ctx))
                ctx.uploaderConfig.createOrUpdate(uploaderType, finalConfigName, answer)
              }
              break
            case 'transformer':
              if (name) {
                const item = ctx.helper.transformer.get(name)
                if (!item) {
                  return ctx.log.error(`No transformer named ${name}`)
                }
                if (item.config) {
                  await handleConfig(ctx, item.config(ctx), module, name)
                }
              } else {
                const prompts = [
                  {
                    type: 'list',
                    name: 'transformer',
                    choices: ctx.helper.transformer.getIdList(),
                    message: 'Choose a transformer'
                  }
                ]
                const answer = await ctx.cmd.inquirer.prompt<ChooseTransformerAnswer>(prompts)
                const item = ctx.helper.transformer.get(answer.transformer)
                if (item?.config) {
                  await handleConfig(ctx, item.config(ctx), module, answer.transformer)
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
                const answer = await ctx.cmd.inquirer.prompt<ChoosePluginAnswer>(prompts)
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
      })
  }
}

export { setting }
