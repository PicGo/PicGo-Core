import PicGo from '../core/PicGo'
import fs from 'fs-extra'
import path from 'path'
import resolve from 'resolve'
import { IBuildInEvent } from '../utils/enum'

/**
 * Local plugin loader, file system is required
 */
class PluginLoader {
  ctx: PicGo
  private list: string[] = []
  private readonly fullList: Set<string> = new Set()
  constructor (ctx: PicGo) {
    this.ctx = ctx
    this.init()
  }

  init (): void {
    const packagePath = path.join(this.ctx.baseDir, 'package.json')
    if (!fs.existsSync(packagePath)) {
      const pkg = {
        name: 'picgo-plugins',
        description: 'picgo-plugins',
        repository: 'https://github.com/Molunerfinn/PicGo-Core',
        license: 'MIT'
      }
      fs.writeFileSync(packagePath, JSON.stringify(pkg), 'utf8')
    }
  }

  // get plugin entry
  resolvePlugin (ctx: PicGo, name: string): string {
    try {
      return resolve.sync(name, { basedir: ctx.baseDir })
    } catch (err) {
      return path.join(ctx.baseDir, 'node_modules', name)
    }
  }

  // load all third party plugin
  load (): boolean {
    const packagePath = path.join(this.ctx.baseDir, 'package.json')
    const pluginDir = path.join(this.ctx.baseDir, 'node_modules/')
    // Thanks to hexo -> https://github.com/hexojs/hexo/blob/master/lib/hexo/load_plugins.js
    if (!fs.existsSync(pluginDir)) {
      return false
    }
    const json = fs.readJSONSync(packagePath)
    const deps = Object.keys(json.dependencies || {})
    const devDeps = Object.keys(json.devDependencies || {})
    const modules = deps.concat(devDeps).filter((name: string) => {
      if (!/^picgo-plugin-|^@[^/]+\/picgo-plugin-/.test(name)) return false
      const path = this.resolvePlugin(this.ctx, name)
      return fs.existsSync(path)
    })
    for (const module of modules) {
      this.registerPlugin(module)
    }
    return true
  }

  registerPlugin (name: string): void {
    this.fullList.add(name)
    if (this.ctx.getConfig(`picgoPlugins.${name}`) === true || (this.ctx.getConfig(`picgoPlugins.${name}`) === undefined)) {
      try {
        this.list.push(name)
        this.ctx.setCurrentPluginName(name)
        this.getPlugin(name).register()
        const plugin = `picgoPlugins[${name}]`
        this.ctx.saveConfig(
          {
            [plugin]: true
          }
        )
      } catch (e) {
        this.list = this.list.filter((item: string) => item !== name)
        this.fullList.delete(name)
        this.ctx.log.error(e)
        this.ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: `Plugin ${name} Load Error`,
          body: e
        })
      }
    }
  }

  unregisterPlugin (name: string): void {
    this.list = this.list.filter((item: string) => item !== name)
    this.fullList.delete(name)
    this.ctx.setCurrentPluginName(name)
    this.ctx.helper.uploader.unregister(name)
    this.ctx.helper.transformer.unregister(name)
    this.ctx.helper.beforeTransformPlugins.unregister(name)
    this.ctx.helper.beforeUploadPlugins.unregister(name)
    this.ctx.helper.afterUploadPlugins.unregister(name)
    this.ctx.removeConfig('picgoPlugins', name)
  }

  // get plugin by name
  getPlugin (name: string): any {
    const pluginDir = path.join(this.ctx.baseDir, 'node_modules/')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(pluginDir + name)(this.ctx)
  }

  /**
   * Get the list of enabled plugins
   */
  getList (): string[] {
    return this.list
  }

  hasPlugin (name: string): boolean {
    return this.fullList.has(name)
  }

  /**
   * Get the full list of plugins, whether it is enabled or not
   */
  getFullList (): string[] {
    return [...this.fullList]
  }
}
export default PluginLoader
