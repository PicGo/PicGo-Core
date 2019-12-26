import PicGo from '../core/PicGo'
import fs from 'fs-extra'
import path from 'path'
import resolve from 'resolve'

class PluginLoader {

  ctx: PicGo
  list: string[]
  constructor (ctx: PicGo) {
    this.ctx = ctx
    this.list = []
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
  load (): void | boolean {
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
    for (let i in modules) {
      this.registerPlugin(modules[i])
    }
  }

  registerPlugin (name: string): void {
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
        this.ctx.log.error(e)
        this.ctx.emit('notification', {
          title: `Plugin ${name} Load Error`,
          body: e
        })
      }
    }
  }

  unregisterPlugin (name: string): void {
    this.list = this.list.filter((item: string) => item !== name)
    this.ctx.setCurrentPluginName(name)
    this.ctx.helper.uploader.unregister(name)
    this.ctx.helper.transformer.unregister(name)
    this.ctx.helper.beforeTransformPlugins.unregister(name)
    this.ctx.helper.beforeUploadPlugins.unregister(name)
    this.ctx.helper.afterUploadPlugins.unregister(name)
    this.ctx.removeConfig('picgoPlugin', name)
  }

  // get plugin by name
  getPlugin (name: string): any {
    const pluginDir = path.join(this.ctx.baseDir, 'node_modules/')
    return require(pluginDir + name)(this.ctx)
  }

  // get plugin name list
  getList (): string[] {
    return this.list
  }
}
export default PluginLoader
