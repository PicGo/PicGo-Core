import { Plugin } from '../utils/interfaces'

class LifecyclePlugins {
  list: {}
  name: string

  constructor (name: string) {
    this.name = name
    this.list = {}
  }

  register (name: string, plugin: Plugin): void {
    if (!name) throw new TypeError('name is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list[name]) throw new TypeError('duplicate name!')

    this.list[name] = plugin
  }

  get (name: string) {
    return this.list[name]
  }

  getList (): Plugin[] {
    return Object.keys(this.list).map(item => this.list[item])
  }

  getNameList (): string[] {
    return Object.keys(this.list)
  }
}

export default LifecyclePlugins
