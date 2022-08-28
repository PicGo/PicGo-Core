import { IPlugin, ILifecyclePlugins } from '../types'

export class LifecyclePlugins implements ILifecyclePlugins {
  static currentPlugin: string | null
  private readonly list: Map<string, IPlugin>
  private readonly pluginIdMap: Map<string, string[]>
  private readonly name: string

  constructor (name: string) {
    this.name = name
    this.list = new Map()
    this.pluginIdMap = new Map()
  }

  register (id: string, plugin: IPlugin): void {
    if (!id) throw new TypeError('id is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list.has(id)) throw new TypeError(`${this.name} duplicate id: ${id}!`)
    this.list.set(id, plugin)
    if (LifecyclePlugins.currentPlugin) {
      if (this.pluginIdMap.has(LifecyclePlugins.currentPlugin)) {
        this.pluginIdMap.get(LifecyclePlugins.currentPlugin)?.push(id)
      } else {
        this.pluginIdMap.set(LifecyclePlugins.currentPlugin, [id])
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

  getName (): string {
    return this.name
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

export const setCurrentPluginName = (name: string | null = null): void => {
  LifecyclePlugins.currentPlugin = name
}

export const getCurrentPluginName = (): string | null => {
  return LifecyclePlugins.currentPlugin
}

export default LifecyclePlugins
