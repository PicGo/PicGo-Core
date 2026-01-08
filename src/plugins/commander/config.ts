import { isPlainObject } from 'lodash'
import type { IConfig, IPicGo, IPlugin } from '../../types'
import { ConfigSyncManager, SyncStatus, EncryptionIntent, E2EAskPinReason } from '../../lib/ConfigSyncManager'
import { printDiffTree } from './utils'

const config: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    const configCommand = cmd.program
      .command('config')
      .description('manage picgo config')

    configCommand
      .command('sync')
      .description('sync config with picgo cloud')
      .option('--encrypt', 'force enable end-to-end encryption')
      .option('--no-encrypt', 'force disable end-to-end encryption')
      .action(async (options: { encrypt?: boolean }) => {
        const onAskPin = async (reason: E2EAskPinReason, retryCount: number): Promise<string | null> => {
          if (reason === E2EAskPinReason.SETUP) {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const { pin } = await ctx.cmd.inquirer.prompt<{ pin: string }>([
                {
                  type: 'password',
                  name: 'pin',
                  message: `Set up E2E encryption. Enter PIN`,
                  mask: '*'
                }
              ])
              const { confirmPin } = await ctx.cmd.inquirer.prompt<{ confirmPin: string }>([
                {
                  type: 'password',
                  name: 'confirmPin',
                  message: `Confirm PIN`,
                  mask: '*'
                }
              ])
              if (pin === confirmPin) {
                return pin
              }
              ctx.log.warn('PIN confirmation does not match. Please try again.')
            }
            return null
          }

          const message = reason === E2EAskPinReason.DECRYPT
            ? 'Enter PIN to decrypt config'
            : `Incorrect PIN. Retry (${retryCount}/3)`

          const { pin } = await ctx.cmd.inquirer.prompt<{ pin: string }>([
            {
              type: 'password',
              name: 'pin',
              message,
              mask: '*'
            }
          ])

          return pin
        }

        const encryptionIntent = options.encrypt === true
          ? EncryptionIntent.FORCE_ENCRYPT
          : options.encrypt === false
            ? EncryptionIntent.FORCE_PLAIN
            : undefined

        if (encryptionIntent === EncryptionIntent.FORCE_ENCRYPT) {
          ctx.saveConfig({
            'settings.picgoCloud.enableE2E': true
          })
        }
        if (encryptionIntent === EncryptionIntent.FORCE_PLAIN) {
          ctx.saveConfig({
            'settings.picgoCloud.enableE2E': false
          })
        }

        const manager = new ConfigSyncManager(ctx, { onAskPin })
        const res = encryptionIntent
          ? await manager.sync({ encryptionIntent })
          : await manager.sync()

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

          let applyOptions: { useE2E: boolean } | undefined
          if (encryptionIntent === EncryptionIntent.FORCE_ENCRYPT) {
            applyOptions = { useE2E: true }
          } else if (encryptionIntent === EncryptionIntent.FORCE_PLAIN) {
            applyOptions = { useE2E: false }
          } else {
            const preference = ctx.getConfig<boolean | undefined>('settings.picgoCloud.enableE2E')
            if (preference === true) {
              applyOptions = { useE2E: true }
            } else if (preference === false) {
              applyOptions = { useE2E: false }
            }
          }
          const applyRes = await manager.applyResolvedConfig(chosen as IConfig, applyOptions)
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
