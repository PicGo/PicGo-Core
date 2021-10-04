import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'
import { generate } from '../../utils/initUtils'
import { homedir } from 'os'
import download from 'download-git-repo'
import { IOptions, IPlugin, IPicGo } from '../../types'
import rm from 'rimraf'

const run = (ctx: IPicGo, options: IOptions): void => {
  // const name = options.inPlace ? path.relative('../', process.cwd()) : options.project
  if (options.offline) { // offline mode
    if (fs.existsSync(options.template)) {
      generate(ctx, options).catch((e) => { ctx.log.error(e) })
    } else {
      ctx.log.error(`Local template ${options.template} not found`)
    }
  } else { // online mode
    options.template = !options.hasSlash
      ? 'PicGo/picgo-template-' + options.template // official template
      : options.template
    downloadAndGenerate(ctx, options)
  }
}

/**
 * download template & generate
 * @param { PicGo } ctx
 * @param { IOptions } options
 */
const downloadAndGenerate = (ctx: IPicGo, options: IOptions): void => {
  if (fs.existsSync(options.tmp)) {
    rm.sync(options.tmp)
  }
  ctx.log.info('Template files are downloading...')
  download(options.template, options.tmp, { clone: options.clone }, (err: Error) => {
    if (err) {
      return ctx.log.error(err)
    }
    ctx.log.success('Template files are downloaded!')
    generate(ctx, options).catch((e) => { ctx.log.error(e) })
  })
}

const init: IPlugin = {
  handle: async (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('init')
      .arguments('<template> [project]')
      .option('--clone', 'use git clone')
      .option('--offline', 'use cached template')
      .description('create picgo plugin\'s development templates')
      .action((template: string, project: string, program: any) => {
        (async () => {
          // Thanks to vue-cli init: https://github.com/vuejs/vue-cli/blob/master/bin/vue-init
          try {
            const hasSlash = template.includes('/')
            const inPlace = !project || project === '.'
            const dest = path.resolve(project || '.')
            const clone = program.clone || false
            const offline = program.offline || false
            const tmp = path.join(homedir(), '.picgo/templates', template.replace(/[/:]/g, '-')) // for caching template

            if (program.offline) {
              template = tmp
            }

            const options = {
              template,
              project,
              hasSlash,
              inPlace,
              dest,
              clone,
              tmp,
              offline
            }

            // check if project is empty or exist
            if (inPlace || fs.existsSync(dest)) {
              await ctx.cmd.inquirer.prompt([
                {
                  type: 'confirm',
                  message: inPlace
                    ? 'Generate project in current directory?'
                    : 'Target directory exists. Continue?',
                  name: 'ok'
                }
              ]).then((answer: any) => {
                if (answer.ok) {
                  run(ctx, options)
                }
              })
            } else { // project is given
              run(ctx, options)
            }
          } catch (e: any) {
            ctx.log.error(e)
            if (process.argv.includes('--debug')) {
              throw e
            }
          }
        })().catch((e) => { ctx.log.error(e) })
      })
      .on('--help', () => {
        console.log()
        console.log('Examples:')
        console.log()
        console.log(chalk.gray('  # create a new project with an official template'))
        console.log('  $ picgo init plugin my-project')
        console.log()
        console.log(chalk.gray('  # create a new project straight from a github template'))
        console.log('  $ picgo init username/repo my-project')
        console.log()
      })
  }
}

export default init
