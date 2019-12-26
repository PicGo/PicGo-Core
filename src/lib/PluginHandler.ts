import PicGo from '../core/PicGo'
import spawn from 'cross-spawn'
import { Result, ProcessEnv } from '../utils/interfaces'

class PluginHandler {
  // Thanks to feflow -> https://github.com/feflow/feflow/blob/master/lib/internal/install/plugin.js
  ctx: PicGo
  constructor (ctx: PicGo) {
    this.ctx = ctx
  }

  async install (plugins: string[], proxy: string = '', env?: ProcessEnv): Promise<void> {
    plugins = plugins.map((item: string) => 'picgo-plugin-' + item)
    const result = await this.execCommand('install', plugins, this.ctx.baseDir, proxy, env)
    if (!result.code) {
      plugins.forEach((plugin: string) => {
        this.ctx.pluginLoader.registerPlugin(plugin)
      })
      this.ctx.log.success('插件安装成功')
      this.ctx.emit('installSuccess', {
        title: '插件安装成功',
        body: plugins
      })
    } else {
      const err = `插件安装失败，失败码为${result.code}，错误日志为${result.data}`
      this.ctx.log.error(err)
      this.ctx.emit('installFailed', {
        title: '插件安装失败',
        body: err
      })
    }
  }
  async uninstall (plugins: string[]): Promise<void> {
    plugins = plugins.map((item: string) => 'picgo-plugin-' + item)
    const result = await this.execCommand('uninstall', plugins, this.ctx.baseDir)
    if (!result.code) {
      plugins.forEach((plugin: string) => {
        this.ctx.pluginLoader.unregisterPlugin(plugin)
      })
      this.ctx.log.success('插件卸载成功')
      this.ctx.emit('uninstallSuccess', {
        title: '插件卸载成功',
        body: plugins
      })
    } else {
      const err = `插件卸载失败，失败码为${result.code}，错误日志为${result.data}`
      this.ctx.log.error(err)
      this.ctx.emit('uninstallFailed', {
        title: '插件卸载失败',
        body: err
      })
    }
  }
  async update (plugins: string[], proxy: string = '', env?: ProcessEnv): Promise<void> {
    plugins = plugins.map((item: string) => 'picgo-plugin-' + item)
    const result = await this.execCommand('update', plugins, this.ctx.baseDir, proxy, env)
    if (!result.code) {
      this.ctx.log.success('插件更新成功')
      this.ctx.emit('updateSuccess', {
        title: '插件更新成功',
        body: plugins
      })
    } else {
      const err = `插件更新失败，失败码为${result.code}，错误日志为${result.data}`
      this.ctx.log.error(err)
      this.ctx.emit('updateFailed', {
        title: '插件更新失败',
        body: err
      })
    }
  }
  execCommand (cmd: string, modules: string[], where: string, proxy: string = '', env: ProcessEnv = {}): Promise<Result> {
    const registry = this.ctx.getConfig('registry')
    return new Promise((resolve: any, reject: any): void => {
      let args = [cmd].concat(modules).concat('--color=always').concat('--save')
      if (registry) {
        args = args.concat(`--registry=${registry}`)
      }
      if (proxy) {
        args = args.concat(`--proxy=${proxy}`)
      }
      try {
        const npm = spawn('npm', args, { cwd: where, env: Object.assign({}, process.env, env) })

        let output = ''
        npm.stdout.on('data', (data: string) => {
          output += data
        }).pipe(process.stdout)

        npm.stderr.on('data', (data: string) => {
          output += data
        }).pipe(process.stderr)

        npm.on('close', (code: number) => {
          if (!code) {
            resolve({ code: 0, data: output })
          } else {
            reject({ code: code, data: output })
          }
        })
        // for users who haven't installed node.js
        npm.on('error', (err: Error) => {
          this.ctx.log.error(err)
          this.ctx.log.error('NPM is not installed')
          this.ctx.emit('failed', 'NPM is not installed')
        })
      } catch (e) {
        this.ctx.log.error(e)
        this.ctx.emit('failed')
      }
    })
  }
}

export default PluginHandler
