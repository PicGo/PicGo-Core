import lowdb from 'lowdb'
import lodashId from 'lodash-id'
import FileSync from 'lowdb/adapters/FileSync'
import json from 'comment-json'
import PicGo from '../core/PicGo'
import { Config } from './interfaces'

class DB {
  private ctx: PicGo
  private db: lowdb.LowdbSync<any>
  constructor (ctx: PicGo) {
    this.ctx = ctx
    const adapter = new FileSync(this.ctx.configPath, {
      serialize (obj: object): string {
        return json.stringify(obj, null, 2)
      },
      deserialize: json.parse
    })
    this.db = lowdb(adapter)
    this.db._.mixin(lodashId)

    if (!this.db.has('picBed').value()) {
      this.db.set('picBed', {
        current: 'smms'
      }).write()
    }
    if (!this.db.has('picgoPlugins').value()) {
      this.db.set('picgoPlugins', {}).write()
    }
  }
  read (): any {
    return this.db.read()
  }
  get (key: string = ''): any {
    return this.read().get(key).value()
  }
  set (key: string, value: any): void {
    return this.read().set(key, value).write()
  }
  has (key: string): boolean {
    return this.read().has(key).value()
  }
  insert (key: string, value: any): void {
    // @ts-ignore
    return this.read().get(key).insert(value).write()
  }
  unset (key: string, value: any): boolean {
    return this.read().get(key).unset(value).write()
  }
  saveConfig (config: Config): void {
    Object.keys(config).forEach((name: string) => {
      this.set(name, config[name])
    })
  }
  removeConfig (config: Config): void {
    Object.keys(config).forEach((name: string) => {
      this.unset(name, config[name])
    })
  }
}

export default DB

// const initConfig = (configPath: string): lowdb.LowdbSync<any> => {
// }

// const saveConfig = (configPath: string, config: any): void => {
//   const db = initConfig(configPath)
//   Object.keys(config).forEach((name: string) => {
//     db.read().set(name, config[name]).write()
//   })
// }

// export {
  // initConfig,
  // saveConfig
// }
