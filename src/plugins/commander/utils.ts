import chalk from 'chalk'
import util from 'util'
import { ConflictType, type IDiffNode } from '../../lib/ConfigSyncManager'

/**
 * Format a config value for CLI output, falling back to util.inspect when JSON fails.
 */
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

/**
 * Print a diff tree with colorized status labels for conflict resolution output.
 */
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

export { formatConfigValue, printDiffTree }
