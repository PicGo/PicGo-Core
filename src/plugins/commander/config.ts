import { isPlainObject } from 'lodash'
import type { IConfig, IPicGo, IPlugin } from '../../types'
import { ConfigSyncManager, SyncStatus, E2EAskPinReason, EncryptionMethod } from '../../lib/ConfigSyncManager'
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
      .option('--encrypt [method]', 'encryption method (auto|sse|e2ee)')
      .action(async (options: { encrypt?: string | boolean }) => {
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

        const rawMethod = options.encrypt
        let encryptionMethod: EncryptionMethod | undefined

        if (rawMethod !== undefined) {
          const methodValue = typeof rawMethod === 'string' ? rawMethod : undefined
          if (methodValue === EncryptionMethod.AUTO || methodValue === EncryptionMethod.SSE || methodValue === EncryptionMethod.E2EE) {
            encryptionMethod = methodValue
            ctx.saveConfig({
              'settings.picgoCloud.encryptionMethod': methodValue
            })
          } else {
            const valueLabel = methodValue ?? 'undefined'
            ctx.log.error(ctx.i18n.translate('CONFIG_SYNC_INVALID_ENCRYPTION_METHOD', { value: `"${valueLabel}"` }))
            return
          }
        }

        const manager = new ConfigSyncManager(ctx, { onAskPin })
        const res = encryptionMethod
          ? await manager.sync({ encryptionMethod })
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
          if (encryptionMethod === EncryptionMethod.E2EE) {
            applyOptions = { useE2E: true }
          } else if (encryptionMethod === EncryptionMethod.SSE) {
            applyOptions = { useE2E: false }
          } else {
            const preference = ctx.getConfig<EncryptionMethod | undefined>('settings.picgoCloud.encryptionMethod')
            if (preference === EncryptionMethod.E2EE) {
              applyOptions = { useE2E: true }
            } else if (preference === EncryptionMethod.SSE) {
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
