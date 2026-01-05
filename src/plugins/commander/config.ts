import chalk from 'chalk'
import { isPlainObject } from 'lodash'
import util from 'util'
import type { IConfig, IPicGo, IPlugin } from '../../types'
import { ConfigSyncManager, SyncStatus, ConflictType, type IDiffNode } from '../../lib/ConfigSyncManager'

const formatConfigValue = (value: unknown): string => {
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return util.inspect(value, {
      depth: 4,
      breakLength: 120,
      maxArrayLength: 50
    })
  }
}

const printDiffTree = (node: IDiffNode, indent: number = 0): void => {
  const pad = ' '.repeat(indent * 2)
  const color =
    node.status === ConflictType.CONFLICT
      ? chalk.red
      : node.status === ConflictType.ADDED
        ? chalk.green
        : node.status === ConflictType.DELETED
          ? chalk.gray
          : node.status === ConflictType.MODIFIED
            ? chalk.yellow
            : chalk.white

  console.log(`${pad}${color(`[${node.status}]`)} ${node.key}`)

  if (node.status === ConflictType.CONFLICT && (!node.children || node.children.length === 0)) {
    console.log(`${pad}  ${chalk.gray('snapshot:')} ${formatConfigValue(node.snapshotValue)}`)
    console.log(`${pad}  ${chalk.cyan('local :')} ${formatConfigValue(node.localValue)}`)
    console.log(`${pad}  ${chalk.magenta('remote:')} ${formatConfigValue(node.remoteValue)}`)
  }

  if (node.children?.length) {
    for (const child of node.children) {
      printDiffTree(child, indent + 1)
    }
  }
}

const config: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    const configCommand = cmd.program
      .command('config')
      .description('manage picgo config')

    configCommand
      .command('sync')
      .description('sync config with picgo cloud')
      .action(async () => {
        const manager = new ConfigSyncManager(ctx)
        const res = await manager.sync()

        if (res.status === SyncStatus.SUCCESS) {
          ctx.log.success(res.message || 'Config sync success!')
          return
        }

        if (res.status === SyncStatus.CONFLICT) {
          ctx.log.warn(res.message || 'Config sync conflict detected.')
          if (res.diffTree) {
            printDiffTree(res.diffTree)
          }

          const { strategy } = await ctx.cmd.inquirer.prompt<{ strategy: 'local' | 'remote' | 'abort' }>([
            {
              type: 'list',
              name: 'strategy',
              message: 'Choose a strategy to resolve conflicts',
              choices: [
                { name: 'Use Local', value: 'local' },
                { name: 'Use Remote', value: 'remote' },
                { name: 'Abort', value: 'abort' }
              ]
            }
          ])

          if (strategy === 'abort') {
            ctx.log.warn('Config sync aborted.')
            return
          }

          const chosen = strategy === 'local'
            ? res.diffTree?.localValue
            : res.diffTree?.remoteValue

          if (!chosen || !isPlainObject(chosen)) {
            ctx.log.error('Invalid resolved config, please resolve it manually.')
            return
          }

          const applyRes = await manager.applyResolvedConfig(chosen as IConfig)
          if (applyRes.status === SyncStatus.SUCCESS) {
            ctx.log.success(applyRes.message || 'Config sync resolved!')
            return
          }

          ctx.log.error(applyRes.message || 'Failed to apply resolved config')
          return
        }

        ctx.log.error(res.message || 'Config sync failed')
      })
  }
}

export { config }
