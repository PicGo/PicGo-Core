import { Command } from 'commander'
import inquirer, { Inquirer } from 'inquirer'
import { IPlugin, ICommander, IPicGo } from '../types'
import commanders from '../plugins/commander'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../../package.json')

export class Commander implements ICommander {
  private list: {
    [propName: string]: IPlugin
  }

  program: Command
  inquirer: Inquirer
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.list = {}
    this.program = new Command()
    this.inquirer = inquirer
    this.ctx = ctx
  }

  init (): void {
    this.program
      .version(version, '-v, --version')
      .option('-d, --debug', 'debug mode', () => {
        this.ctx.setConfig({
          debug: true
        })
      })
      .option('-s, --silent', 'silent mode', () => {
        this.ctx.setConfig({
          silent: true
        })
      })
      .on('command:*', () => {
        this.ctx.log.error(`Invalid command: ${this.program.args.join(' ')}\nSee --help for a list of available commands.`)
        process.exit(1)
      })

    // built-in commands
    commanders(this.ctx)
  }

  register (name: string, plugin: IPlugin): void {
    if (!name) throw new TypeError('name is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (name in this.list) throw new TypeError('duplicate name!')

    this.list[name] = plugin
  }

  loadCommands (): void {
    Object.keys(this.list).map((item: string) => this.list[item].handle(this.ctx))
  }

  get (name: string): IPlugin {
    return this.list[name]
  }

  getList (): IPlugin[] {
    return Object.keys(this.list).map((item: string) => this.list[item])
  }
}

export default Commander
