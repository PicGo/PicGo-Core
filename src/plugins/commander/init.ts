import PicGo from '../../core/PicGo'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'
import { generate } from '../../utils/initUtils'
import { homedir } from 'os'
import download from 'download-git-repo'

const run = (ctx: PicGo, template: string, hasSlash: boolean, project: string, clone: boolean): void => {
  let templateName = !hasSlash
    ? 'PicGo/picgo-template-' + template
    : template
  downloadAndGenerate(ctx, templateName, project, clone)
}

const downloadAndGenerate = (ctx: PicGo, template: string, project: string, clone: boolean): void => {
  const tmp = path.join(homedir(), '.picgo', template)
  const to = path.resolve(project || '.')
  download(template, tmp, { clone }, (err: Error) => {
    if (err) {
      return console.error(err)
    }
    generate(ctx, template, tmp, to, (err: any) => {
      console.log(err)
    })
  })
}

export default {
  handle: (ctx: PicGo): void => {
    const cmd: typeof ctx.cmd = ctx.cmd
    cmd.program
      .command('init')
      .arguments('<template> [project]')
      .option('--clone', 'use git clone')
      .action(async (template: string, project: string, program: any) => {
        // Thanks to vue-cli init: https://github.com/vuejs/vue-cli/blob/master/bin/vue-init
        try {
          const hasSlash = template.indexOf('/') > -1
          const inPlace = !project || project === '.'
          // const name = inPlace ? path.relative('../', process.cwd()) : project
          const to = path.resolve(project || '.')
          const clone = program.clone || false

          if (inPlace || fs.existsSync(to)) {
            ctx.cmd.inquirer.prompt([
              {
                type: 'confirm',
                message: inPlace
                  ? 'Generate project in current directory?'
                  : 'Target directory exists. Continue?',
                name: 'ok'
              }
            ]).then((answer: any) => {
              if (answer.ok) {
                run(ctx, template, hasSlash, project, clone)
              }
            })
          } else {
            run(ctx, template, hasSlash, project, clone)
          }
        } catch (e) {
          ctx.log.error(e)
          if (process.argv.includes('--debug')) {
            Promise.reject(e)
          }
        }
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
