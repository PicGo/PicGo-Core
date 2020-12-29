import fs from 'fs-extra'
import path from 'path'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import Commander from '../lib/Commander'
import Logger from '../lib/Logger'
import Lifecycle from './Lifecycle'
import LifecyclePlugins from '../lib/LifecyclePlugins'
import uploaders from '../plugins/uploader'
import transformers from '../plugins/transformer'
import PluginLoader from '../lib/PluginLoader'
import { get, set, unset } from 'lodash'
import { IHelper, IImgInfo, IConfig, IPicGo, IStringKeyMap, IPicGoPlugin } from '../types'
import getClipboardImage from '../utils/getClipboardImage'
import Request from '../lib/Request'
import DB from '../utils/db'
import PluginHandler from '../lib/PluginHandler'
import { IBuildInEvent } from '../utils/enum'

class PicGo extends EventEmitter implements IPicGo {
  private config!: IConfig
  private lifecycle!: Lifecycle
  private db!: DB
  configPath: string
  baseDir!: string
  helper!: IHelper
  log: Logger
  cmd: Commander
  output: IImgInfo[]
  input: any[]
  pluginLoader!: PluginLoader
  pluginHandler: PluginHandler
  Request!: Request

  constructor (configPath: string = '') {
    super()
    this.configPath = configPath
    this.output = []
    this.input = []
    this.helper = {
      transformer: new LifecyclePlugins('transformer'),
      uploader: new LifecyclePlugins('uploader'),
      beforeTransformPlugins: new LifecyclePlugins('beforeTransformPlugins'),
      beforeUploadPlugins: new LifecyclePlugins('beforeUploadPlugins'),
      afterUploadPlugins: new LifecyclePlugins('afterUploadPlugins')
    }
    this.initConfigPath()
    this.log = new Logger(this)
    this.cmd = new Commander(this)
    this.pluginHandler = new PluginHandler(this)
    this.initConfig()
    this.init()
  }

  setCurrentPluginName (name: string): void {
    LifecyclePlugins.currentPlugin = name
  }

  private initConfigPath (): void {
    if (this.configPath === '') {
      this.configPath = homedir() + '/.picgo/config.json'
    }
    if (path.extname(this.configPath).toUpperCase() !== '.JSON') {
      this.configPath = ''
      throw Error('The configuration file only supports JSON format.')
    }
    this.baseDir = path.dirname(this.configPath)
    const exist = fs.pathExistsSync(this.configPath)
    if (!exist) {
      fs.ensureFileSync(`${this.configPath}`)
    }
  }

  private initConfig (): void {
    this.db = new DB(this)
    this.config = this.db.read().value()
  }

  private init (): void {
    try {
      this.Request = new Request(this)
      this.pluginLoader = new PluginLoader(this)
      // load self plugins
      this.setCurrentPluginName('picgo')
      uploaders(this)
      transformers(this)
      this.setCurrentPluginName('')
      // load third-party plugins
      this.pluginLoader.load()
      this.lifecycle = new Lifecycle(this)
    } catch (e) {
      this.emit(IBuildInEvent.UPLOAD_PROGRESS, -1)
      this.log.error(e)
      throw e
    }
  }

  /** register command-line commands
   please manually remove listeners for avoiding listeners memory leak */
  registerCommands (): void {
    if (this.configPath !== '') {
      this.cmd.init()
      this.cmd.loadCommands()
    }
  }

  /** get config by property path, return full config if `name` is not provided */
  getConfig<T> (name?: string): T {
    if (!name) {
      return this.config as unknown as T
    } else {
      return get(this.config, name)
    }
  }

  /** save to db */
  saveConfig (config: object): void {
    this.setConfig(config)
    this.db.saveConfig(config)
  }

  /** remove from db */
  removeConfig (key: string, propName: string): void {
    if (!key || !propName) return
    this.unsetConfig(key, propName)
    this.db.unset(key, propName)
  }

  // set config for ctx but will not be saved to db
  // it's more lightweight
  setConfig (config: IStringKeyMap<any>): void {
    Object.keys(config).forEach((name: string) => {
      set(this.config, name, config[name])
    })
  }

  // unset config for ctx but won't be saved to db
  unsetConfig (key: string, propName: string): void {
    if (!key || !propName) return
    unset(this.getConfig(key), propName)
  }

  /**
   * for node project adding a plugin by a simple way
   */
  addPlugin (name: string, plugin: IPicGoPlugin): void {
    if (!name || !plugin || (typeof plugin !== 'function')) {
      this.log.warn('Please provide valid plugin')
      return
    }
    try {
      plugin(this).register()
    } catch (e) {
      this.log.warn('Please provide valid plugin')
      this.log.error(e)
    }
  }

  async upload (input?: any[]): Promise<IImgInfo[] | Error> {
    if (this.configPath === '') {
      this.log.error('The configuration file only supports JSON format.')
      return []
    }
    // upload from clipboard
    if (input === undefined || input.length === 0) {
      try {
        const { imgPath, isExistFile } = await getClipboardImage(this)
        if (imgPath === 'no image') {
          throw new Error('image not found in clipboard')
        } else {
          this.once('failed', () => {
            if (!isExistFile) {
              // 删除 picgo 生成的图片文件，例如 `~/.picgo/20200621205720.png`
              fs.remove(imgPath).catch((e) => { this.log.error(e) })
            }
          })
          this.once('finished', () => {
            if (!isExistFile) {
              fs.remove(imgPath).catch((e) => { this.log.error(e) })
            }
          })
          await this.lifecycle.start([imgPath])
          return this.output
        }
      } catch (e) {
        this.log.error(e)
        this.emit(IBuildInEvent.FAILED, e)
        throw e
      }
    } else {
      // upload from path
      await this.lifecycle.start(input)
      return this.output
    }
  }
}

export default PicGo
