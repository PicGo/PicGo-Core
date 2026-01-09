import { IPicGo, IPlugin, Undefinable } from '../../types'
import chalk from 'chalk'

type UploaderOperation = 'list' | 'rename' | 'copy' | 'delete'

type UploaderOperationAnswer = {
  operation: UploaderOperation
}

type UploaderTypeAnswer = {
  type: string
}

type UploaderConfigAnswer = {
  configName: string
}

type UploaderRenameAnswer = {
  newName: string
}

type UploaderCopyAnswer = {
  newName: string
}

type UploaderConfirmAnswer = {
  confirm: boolean
}

const normalizeName = (name: string): string => name.trim()
const toCompareName = (name: string): string => normalizeName(name).toLowerCase()

const buildListOutput = (ctx: IPicGo, types: string[]): string => {
  const current = ctx.getConfig<Undefinable<string>>('picBed.current')
  const lines: string[] = []

  for (const type of types) {
    const isCurrent = current === type
    if (isCurrent) {
      lines.push(chalk.green.bold(`+ ${type} [Current Uploader]`))
    } else {
      lines.push(`+ ${type}`)
    }

    const list = ctx.uploaderConfig.getConfigList(type)
    if (list.length === 0) {
      lines.push(chalk.grey('  (No configs found)'))
      continue
    }

    const defaultId = ctx.getConfig<Undefinable<string>>(`uploader.${type}.defaultId`)
    for (const cfg of list) {
      if (cfg._id === defaultId) {
        lines.push(chalk.blue(`  * ${cfg._configName} [Default Config]`))
      } else {
        lines.push(`    ${cfg._configName}`)
      }
    }
  }

  return `\n${lines.join('\n')}`
}

export const uploader: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd

    const uploaderCmd = cmd.program
      .command('uploader')
      .description('manage uploader configurations')
      .action(async () => {
        try {
          const operations = [
            { name: 'List all configurations', value: 'list' },
            { name: 'Rename config', value: 'rename' },
            { name: 'Copy config', value: 'copy' },
            { name: 'Delete config', value: 'delete' }
          ]

          const opAnswer = await cmd.inquirer.prompt<UploaderOperationAnswer>([
            {
              type: 'list',
              name: 'operation',
              message: 'Choose an operation:',
              choices: operations
            }
          ])

          if (opAnswer.operation === 'list') {
            const types = ctx.uploaderConfig.listUploaderTypes()
            console.log(buildListOutput(ctx, types))
            return
          }

          const typesWithConfigs = ctx.uploaderConfig.listUploaderTypes()
            .filter(type => ctx.uploaderConfig.getConfigList(type).length > 0)

          if (typesWithConfigs.length === 0) {
            ctx.log.warn('No configs found')
            return
          }

          const typeAnswer = await cmd.inquirer.prompt<UploaderTypeAnswer>([
            {
              type: 'list',
              name: 'type',
              message: 'Choose an uploader:',
              choices: typesWithConfigs
            }
          ])

          const type = String(typeAnswer.type)
          const configs = ctx.uploaderConfig.getConfigList(type)
          const names = configs.map(item => item._configName)

          const cfgAnswer = await cmd.inquirer.prompt<UploaderConfigAnswer>([
            {
              type: 'list',
              name: 'configName',
              message: opAnswer.operation === 'rename' ? 'Choose a config to rename:' : opAnswer.operation === 'copy' ? 'Choose a config to copy:' : 'Choose a config to delete:',
              choices: names
            }
          ])

          const targetName = String(cfgAnswer.configName)

          if (opAnswer.operation === 'rename') {
            const renameAnswer = await cmd.inquirer.prompt<UploaderRenameAnswer>([
              {
                type: 'input',
                name: 'newName',
                message: 'Enter new name:',
                validate: (input: string) => {
                  const next = normalizeName(input)
                  if (!next) return 'Config name can not be empty'
                  const exists = names.some(n => toCompareName(n) === toCompareName(next) && toCompareName(n) !== toCompareName(targetName))
                  if (exists) return `Config name ${next} already exists`
                  return true
                }
              }
            ])
            ctx.uploaderConfig.rename(type, targetName, String(renameAnswer.newName))
            ctx.log.success('Rename config successfully!')
            return
          }

          if (opAnswer.operation === 'copy') {
            const copyAnswer = await cmd.inquirer.prompt<UploaderCopyAnswer>([
              {
                type: 'input',
                name: 'newName',
                message: 'Enter new name:',
                validate: (input: string) => {
                  const next = normalizeName(input)
                  if (!next) return 'Config name can not be empty'
                  const exists = names.some(n => toCompareName(n) === toCompareName(next))
                  if (exists) return `Config name ${next} already exists`
                  return true
                }
              }
            ])
            ctx.uploaderConfig.copy(type, targetName, String(copyAnswer.newName))
            ctx.log.success('Copy config successfully!')
            return
          }

          const confirmAnswer = await cmd.inquirer.prompt<UploaderConfirmAnswer>([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete ${targetName}?`,
              default: false
            }
          ])
          if (!confirmAnswer.confirm) return

          ctx.uploaderConfig.remove(type, targetName)
          ctx.log.success('Delete config successfully!')
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })

    uploaderCmd
      .command('list [type]')
      .description('list uploader configurations')
      .action(async (type?: string) => {
        try {
          const types = ctx.uploaderConfig.listUploaderTypes()
          if (typeof type === 'string' && type) {
            if (!types.includes(type)) {
              ctx.log.error(`Type ${type} not found`)
              return
            }
            console.log(buildListOutput(ctx, [type]))
            return
          }
          console.log(buildListOutput(ctx, types))
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })

    uploaderCmd
      .command('rename <type> <oldName> <newName>')
      .description('rename a config')
      .action(async (type: string, oldName: string, newName: string) => {
        try {
          ctx.uploaderConfig.rename(type, oldName, newName)
          ctx.log.success('Rename config successfully!')
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })

    uploaderCmd
      .command('copy <type> <configName> <newConfigName>')
      .description('copy a config (does not switch current uploader)')
      .action(async (type: string, configName: string, newConfigName: string) => {
        try {
          ctx.uploaderConfig.copy(type, configName, newConfigName)
          ctx.log.success('Copy config successfully!')
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })

    uploaderCmd
      .command('rm <type> <configName>')
      .description('remove a config')
      .action(async (type: string, configName: string) => {
        try {
          ctx.uploaderConfig.remove(type, configName)
          ctx.log.success('Delete config successfully!')
        } catch (e: any) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            throw e
          }
        }
      })
  }
}
