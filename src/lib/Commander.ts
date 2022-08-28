/* eslint-disable @typescript-eslint/no-misused-promises */
import { Command } from 'commander'
import inquirer, { Inquirer } from 'inquirer'
import { IPlugin, ICommander, IPicGo } from '../types'
import commanders from '../plugins/commander'
import { getCurrentPluginName } from './LifecyclePlugins'

export class Commander implements ICommander {
  private readonly name = 'commander'
  static currentPlugin: string | null
  private readonly list: Map<string, IPlugin> = new Map()
  private readonly pluginIdMap: Map<string, string[]> = new Map()
  private readonly ctx: IPicGo

  program: Command
  inquirer: Inquirer

  constructor (ctx: IPicGo) {
    this.program = new Command()
    this.inquirer = inquirer
    this.ctx = ctx
  }

  getName (): string {
    return this.name
  }

  init (): void {
    this.program
      .version(process.env.PICGO_VERSION, '-v, --version')
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

  register (id: string, plugin: IPlugin): void {
    if (!id) throw new TypeError('name is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list.has(id)) throw new TypeError(`${this.name} plugin duplicate id: ${id}!`)
    this.list.set(id, plugin)
    const currentPluginName = getCurrentPluginName()
    if (currentPluginName !== null) {
      if (this.pluginIdMap.has(currentPluginName)) {
        this.pluginIdMap.get(currentPluginName)?.push(id)
      } else {
        this.pluginIdMap.set(currentPluginName, [id])
      }
    }
  }

  unregister (pluginName: string): void {
    if (this.pluginIdMap.has(pluginName)) {
      const pluginList = this.pluginIdMap.get(pluginName)
      pluginList?.forEach((plugin: string) => {
        this.list.delete(plugin)
      })
    }
  }

  loadCommands (): void {
    this.getList().forEach((item: IPlugin) => {
      try {
        item.handle(this.ctx)
      } catch (e: any) {
        this.ctx.log.error(e)
      }
    })
  }

  get (id: string): IPlugin | undefined {
    return this.list.get(id)
  }

  getList (): IPlugin[] {
    return [...this.list.values()]
  }

  getIdList (): string[] {
    return [...this.list.keys()]
  }
}

export default Commander
