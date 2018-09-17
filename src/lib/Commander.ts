import PicGo from '../core/PicGo'
import program from 'commander'
import inquirer from 'inquirer'
import pkg from '../../package.json'
import { Plugin } from '../utils/interfaces'

class Commander {
  list: {}
  program: typeof program
  inquirer: typeof inquirer
  private ctx: PicGo

  constructor (ctx: PicGo) {
    this.list = {}
    this.program = program
    this.inquirer = inquirer
    this.ctx = ctx
    this.init()
  }

  init () {
    this.program
      .version(pkg.version, '-v, --version')
      .option('-d, --debug', 'debug mode', () => {
        this.ctx.config.debug = true
      })
      .option('-s, --silent', 'silent mode', () => {
        this.ctx.config.silent = true
      })
      .on('command:*', () => {
        this.ctx.log.error(`Invalid command: ${this.program.args.join(' ')}\nSee --help for a list of available commands.`)
        process.exit(1)
      })
  }

  register (name: string, plugin: Plugin) {
    if (!name) throw new TypeError('name is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list[name]) throw new TypeError('duplicate name!')

    this.list[name] = plugin
    this.list[name].handle(this.ctx)
  }

  get (name: string) {
    return this.list[name]
  }

  getList (): Plugin[] {
    return Object.keys(this.list).map(item => this.list[item])
  }
}

export default Commander
