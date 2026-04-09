import type { Command } from 'commander'
import type { IPicGo } from '../../../types'
import { printJson, runCloudCommand } from './shared'

const registerCloudGetCommand = (ctx: IPicGo, cloudCommand: Command): void => {
  cloudCommand
    .command('get')
    .description('get one cloud album item')
    .argument('<id>')
    .action(async (id: string) => {
      await runCloudCommand(ctx, async () => {
        const item = await ctx.cloud.album.get(id)
        printJson(item)
      })
    })
}

export { registerCloudGetCommand }
