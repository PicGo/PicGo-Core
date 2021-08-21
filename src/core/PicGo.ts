import fs from 'fs-extra'
import path from 'path'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import Commander from '../lib/Commander'
import Logger from '../lib/Logger'
import Lifecycle from './Lifecycle'
import LifecyclePlugins, { setCurrentPluginName } from '../lib/LifecyclePlugins'
import uploaders from '../plugins/uploader'
import transformers from '../plugins/transformer'
import PluginLoader from '../lib/PluginLoader'
import { get, set, unset } from 'lodash'
import { IHelper, IImgInfo, IConfig, IPicGo, IStringKeyMap, IPluginLoader } from '../types'
import getClipboardImage from '../utils/getClipboardImage'
import Request from '../lib/Request'
import DB from '../utils/db'
import PluginHandler from '../lib/PluginHandler'
import { IBuildInEvent, IBusEvent } from '../utils/enum'
import { version } from '../../package.json'
import { eventBus } from '../utils/eventBus'
import { RequestPromiseAPI } from 'request-promise-native'
import { isConfigKeyInBlackList, isInputConfigValid } from '../utils/common'

class PicGo extends EventEmitter implements IPicGo {
  private _config!: IConfig
  private lifecycle!: Lifecycle
  private db!: DB
  private _pluginLoader!: PluginLoader
  configPath: string
  baseDir!: string
  helper!: IHelper
  log: Logger
  cmd: Commander
  output: IImgInfo[]
  input: any[]
  pluginHandler: PluginHandler
  /**
   * @deprecated will be removed in v1.5.0+
   *
   * use request instead
   */
  Request!: Request
  VERSION: string = version
  GUI_VERSION?: string

  get pluginLoader (): IPluginLoader {
    return this._pluginLoader
  }

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
    this._config = this.db.read().value()
  }

  private init (): void {
    try {
      this.Request = new Request(this)
      this._pluginLoader = new PluginLoader(this)
      // load self plugins
      setCurrentPluginName('picgo')
      uploaders(this).register(this)
      transformers(this).register(this)
      setCurrentPluginName('')
      // load third-party plugins
      this._pluginLoader.load()
      this.lifecycle = new Lifecycle(this)
    } catch (e) {
      this.emit(IBuildInEvent.UPLOAD_PROGRESS, -1)
      this.log.error(e)
      throw e
    }
  }

  registerCommands (): void {
    if (this.configPath !== '') {
      this.cmd.init()
      this.cmd.loadCommands()
    }
  }

  getConfig<T> (name?: string): T {
    if (!name) {
      console.log(this._config)
      return this._config as unknown as T
    } else {
      return get(this._config, name)
    }
  }

  saveConfig (config: IStringKeyMap<any>): void {
    if (!isInputConfigValid(config)) {
      this.log.warn('the format of config is invalid, please provide object')
      return
    }
    this.setConfig(config)
    this.db.saveConfig(config)
  }

  removeConfig (key: string, propName: string): void {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      this.log.warn(`the config.${key} can't be removed`)
      return
    }
    this.unsetConfig(key, propName)
    this.db.unset(key, propName)
  }

  setConfig (config: IStringKeyMap<any>): void {
    if (!isInputConfigValid(config)) {
      this.log.warn('the format of config is invalid, please provide object')
      return
    }
    Object.keys(config).forEach((name: string) => {
      if (isConfigKeyInBlackList(name)) {
        this.log.warn(`the config.${name} can't be modified`)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete config[name]
      }
      set(this._config, name, config[name])
      eventBus.emit(IBusEvent.CONFIG_CHANGE, {
        configName: name,
        value: config[name]
      })
    })
  }

  unsetConfig (key: string, propName: string): void {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      this.log.warn(`the config.${key} can't be unset`)
      return
    }
    unset(this.getConfig(key), propName)
  }

  get request (): RequestPromiseAPI {
    // TODO: replace request with got: https://github.com/sindresorhus/got
    return this.Request.request
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
          this.once(IBuildInEvent.FAILED, () => {
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
          const { output } = await this.lifecycle.start([imgPath])
          return output
        }
      } catch (e) {
        this.emit(IBuildInEvent.FAILED, e)
        throw e
      }
    } else {
      // upload from path
      const { output } = await this.lifecycle.start(input)
      return output
    }
  }
}

export default PicGo
