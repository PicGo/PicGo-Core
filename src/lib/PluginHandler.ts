import PicGo from '../core/PicGo'
import spawn from 'cross-spawn'
import path from 'path'
import fs from 'fs-extra'
import { Result } from '../utils/interfaces'

class PluginHandler {
  // Thanks to feflow -> https://github.com/feflow/feflow/blob/master/lib/internal/install/plugin.js
  ctx: PicGo
  constructor (ctx: PicGo) {
    this.ctx = ctx
    this.init()
  }
  init () {
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

  install (plugins: string[]) {
    return this.execCommand('install', plugins, this.ctx.baseDir).then((result: Result) => {
      if (!result.code) {
        this.ctx.log.success('插件安装成功')
      } else {
        const err = `插件安装失败，失败码为${result.code}，错误日志为${result.data}`
        this.ctx.log.error(err)
      }
    })
  }
  uninstall (plugins: string[]) {
    return this.execCommand('uninstall', plugins, this.ctx.baseDir).then((result: Result) => {
      if (!result.code) {
        this.ctx.log.success('插件卸载成功')
      } else {
        const err = `插件卸载失败，失败码为${result.code}，错误日志为${result.data}`
        this.ctx.log.error(err)
      }
    })
  }
  update (plugins: string[]) {
    return this.execCommand('update', plugins, this.ctx.baseDir).then((result: Result) => {
      if (!result.code) {
        this.ctx.log.success('插件更新成功')
      } else {
        const err = `插件更新失败，失败码为${result.code}，错误日志为${result.data}`
        this.ctx.log.error(err)
      }
    })
  }
  execCommand (cmd: string, modules: string[], where: string) {
    const registry = this.ctx.config.registry
    const proxy = this.ctx.config.proxy
    return new Promise((resolve, reject) => {
      let args = [cmd].concat(modules).concat('--color=always').concat('--save')
      if (registry) {
        args = args.concat(`--registry=${registry}`)
      }
      if (proxy) {
        args = args.concat(`--proxy=${proxy}`)
      }

      const npm = spawn('npm', args, { cwd: where })

      let output = ''
      npm.stdout.on('data', (data) => {
        output += data
      }).pipe(process.stdout)

      npm.stderr.on('data', (data) => {
        output += data
      }).pipe(process.stderr)

      npm.on('close', (code) => {
        if (!code) {
          resolve({ code: 0, data: output })
        } else {
          reject({ code: code, data: output })
        }
      })
    })
  }
}

export default PluginHandler
