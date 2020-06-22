import { Plugin } from '../utils/interfaces'

class LifecyclePlugins {
  static currentPlugin: string | null
  private readonly list: Map<string, Plugin>
  private readonly pluginIdMap: Map<string, string[]>
  private readonly name: string

  constructor (name: string) {
    this.name = name
    this.list = new Map()
    this.pluginIdMap = new Map()
  }

  register (id: string, plugin: Plugin): void {
    if (id === '') throw new TypeError('id is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list.has(id)) throw new TypeError(`${this.name} duplicate id: ${id}!`)
    this.list.set(id, plugin)
    if (LifecyclePlugins.currentPlugin !== null) {
      if (this.pluginIdMap.has(LifecyclePlugins.currentPlugin)) {
        this.pluginIdMap.get(LifecyclePlugins.currentPlugin).push(id)
      } else {
        this.pluginIdMap.set(LifecyclePlugins.currentPlugin, [id])
      }
    }
  }

  unregister (pluginName: string): void {
    if (this.pluginIdMap.has(pluginName)) {
      const pluginList = this.pluginIdMap.get(pluginName)
      pluginList.forEach((plugin: string) => {
        this.list.delete(plugin)
      })
    }
  }

  getName (): string {
    return this.name
  }

  get (id: string): Plugin {
    return this.list.get(id)
  }

  getList (): Plugin[] {
    return [...this.list.values()]
  }

  getIdList (): string[] {
    return [...this.list.keys()]
  }
}

export default LifecyclePlugins
