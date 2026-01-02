import type { IPicGo, IPlugin } from '../../types'

const server: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('server')
      .description('run PicGo as a standalone server')
      // keep --help, free up -h for host
      .helpOption('--help', 'display help for command')
      .option('-p, --port <n>', 'server port')
      .option('-h, --host <s>', 'server host')
      .option('-i, --ignore-existing-server', 'ignore existing PicGo server instance')
      .action(async (options: { port?: string; host?: string; ignoreExistingServer?: boolean }) => {
        try {
          const port = options.port ? Number(options.port) : undefined
          const host = options.host
          await ctx.server.listen(port, host, options.ignoreExistingServer)
        } catch (e) {
          ctx.log.error(e as Error)
        }
      })
  }
}

export { server }
