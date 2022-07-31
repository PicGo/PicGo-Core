import { IConfig, IPicGo } from '../types'
import { JSONStore } from '@picgo/store'
import { IJSON } from '@picgo/store/dist/types'

class DB {
  private readonly ctx: IPicGo
  private readonly db: JSONStore
  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.db = new JSONStore(this.ctx.configPath)

    if (!this.db.has('picBed')) {
      try {
        this.db.set('picBed', {
          uploader: 'smms',
          current: 'smms'
        })
      } catch (e: any) {
        this.ctx.log.error(e)
        throw e
      }
    }
    if (!this.db.has('picgoPlugins')) {
      try {
        this.db.set('picgoPlugins', {})
      } catch (e: any) {
        this.ctx.log.error(e)
        throw e
      }
    }
  }

  read (flush?: boolean): IJSON {
    return this.db.read(flush)
  }

  get (key: string = ''): any {
    this.read(true)
    return this.db.get(key)
  }

  set (key: string, value: any): void {
    this.read(true)
    return this.db.set(key, value)
  }

  has (key: string): boolean {
    this.read(true)
    return this.db.has(key)
  }

  unset (key: string, value: any): boolean {
    this.read(true)
    return this.db.unset(key, value)
  }

  saveConfig (config: Partial<IConfig>): void {
    Object.keys(config).forEach((name: string) => {
      this.set(name, config[name])
    })
  }

  removeConfig (config: IConfig): void {
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
