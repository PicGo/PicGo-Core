import { Plugin } from '../utils/interfaces'

class LifecyclePlugins {
  list: {
    [propName: string]: Plugin
  }
  name: string

  constructor (name: string) {
    this.name = name
    this.list = {}
  }

  register (id: string, plugin: Plugin): void {
    if (!id) throw new TypeError('id is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list[id]) throw new TypeError(`${this.name} duplicate id: ${id}!`)

    this.list[id] = plugin
  }

  get (id: string): Plugin {
    return this.list[id]
  }

  getList (): Plugin[] {
    return Object.keys(this.list).map((item: string) => this.list[item])
  }

  getIdList (): string[] {
    return Object.keys(this.list)
  }
}

export default LifecyclePlugins
