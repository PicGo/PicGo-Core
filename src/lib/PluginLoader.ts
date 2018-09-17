import PicGo from '../core/PicGo'
import fs from 'fs-extra'
import path from 'path'
import resolve from 'resolve'

class PluginLoader {

  ctx: PicGo
  list: string[]
  constructor (ctx) {
    this.ctx = ctx
    this.list = []
  }

  // get plugin entry
  resolvePlugin (ctx: PicGo, name: string) {
    try {
      return resolve.sync(name, { basedir: ctx.baseDir })
    } catch (err) {
      return path.join(ctx.baseDir, 'node_modules', name)
    }
  }

  // load all third party plugin
  load () {
    const packagePath = path.join(this.ctx.baseDir, 'package.json')
    const pluginDir = path.join(this.ctx.baseDir, 'node_modules/')
    try {
      // Thanks to hexo -> https://github.com/hexojs/hexo/blob/master/lib/hexo/load_plugins.js
      if (!fs.existsSync(pluginDir)) {
        return false
      }
      // const content = await fs.readFile(packagePath, 'utf-8')
      // const json = JSON.parse(content)
      const json = require(packagePath)
      const deps = Object.keys(json.dependencies || {})
      const devDeps = Object.keys(json.devDependencies || {})
      const modules = deps.concat(devDeps).filter(name => {
        if (!/^picgo-plugin-|^@[^/]+\/picgo-plugin-/.test(name)) return false
        const path = this.resolvePlugin(this.ctx, name)
        return fs.existsSync(path)
      })
      for (let i in modules) {
        this.list.push(modules[i])
        if (this.ctx.config.plugins[modules[i]] || this.ctx.config.plugins[modules[i]] === undefined) {
          this.getPlugin(modules[i]).register()
          const plugin = `plugins[${modules[i]}]`
          this.ctx.saveConfig(
            {
              [plugin]: true
            }
          )
        }
      }
    } catch (e) {
      throw new Error(e)
    }
  }

  // get plugin by name
  getPlugin (name: string) {
    const pluginDir = path.join(this.ctx.baseDir, 'node_modules/')
    return require(pluginDir + name)(this.ctx)
  }

  // get plugin name list
  getList (): string[] {
    return this.list
  }
}
export default PluginLoader
