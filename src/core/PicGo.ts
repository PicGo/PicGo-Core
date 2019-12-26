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
import { Helper, ImgInfo, Config } from '../utils/interfaces'
import getClipboardImage from '../utils/getClipboardImage'
import Request from '../lib/Request'
import DB from '../utils/db'
import PluginHandler from '../lib/PluginHandler'

class PicGo extends EventEmitter {
  private config: Config
  private lifecycle: Lifecycle
  private db: DB
  configPath: string
  baseDir: string
  helper: Helper
  log: Logger
  cmd: Commander
  output: ImgInfo[]
  input: any[]
  pluginLoader: PluginLoader
  pluginHandler: PluginHandler
  Request: Request

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
    this.log = new Logger(this)
    this.cmd = new Commander(this)
    this.pluginHandler = new PluginHandler(this)
    this.initConfig()
    this.init()
  }

  setCurrentPluginName (name: string): void {
    LifecyclePlugins.currentPlugin = name
  }

  initConfig (): void {
    if (this.configPath === '') {
      this.configPath = homedir() + '/.picgo/config.json'
    }
    if (path.extname(this.configPath).toUpperCase() !== '.JSON') {
      this.configPath = ''
      this.log.error('The configuration file only supports JSON format.')
      return
    }
    this.baseDir = path.dirname(this.configPath)
    const exist = fs.pathExistsSync(this.configPath)
    if (!exist) {
      fs.ensureFileSync(`${this.configPath}`)
    }
    this.db = new DB(this)
    this.config = this.db.read().value()
  }

  init (): any {
    try {
      // load self plugins
      this.Request = new Request(this)
      this.pluginLoader = new PluginLoader(this)
      this.setCurrentPluginName('picgo')
      uploaders(this)
      transformers(this)
      this.setCurrentPluginName(null)
      // load third-party plugins
      this.pluginLoader.load()
      this.lifecycle = new Lifecycle(this)
    } catch (e) {
      this.emit('uploadProgress', -1)
      this.log.error(e)
      throw e
    }
  }

  // register commandline commands
  // please mannually remove listeners for avoiding listeners memory leak
  registerCommands (): void {
    if (this.configPath !== '') {
      this.cmd.init()
      this.cmd.loadCommands()
    }
  }

  // get config
  getConfig (name: string = ''): any {
    if (!this.config) return
    if (name) {
      return get(this.config, name)
    } else {
      return this.config
    }
  }

  // save to db
  saveConfig (config: Config): void {
    this.setConfig(config)
    this.db.saveConfig(config)
  }

  // remove from db
  removeConfig (key: string, propName: string): void {
    if (!key || !propName) return
    this.unsetConfig(key, propName)
    this.db.unset(key, propName)
  }

  // set config for ctx but will not be saved to db
  // it's more lightweight
  setConfig (config: Config): void {
    Object.keys(config).forEach((name: string) => {
      set(this.config, name, config[name])
    })
  }

  // unset config for ctx but won't be saved to db
  unsetConfig (key: string, propName: string): void {
    if (!key || !propName) return
    unset(this.getConfig(key), propName)
  }

  async upload (input?: any[]): Promise<void | string | Error> {
    if (this.configPath === '') return this.log.error('The configuration file only supports JSON format.')
    // upload from clipboard
    if (input === undefined || input.length === 0) {
      try {
        const { imgPath, isExistFile } = await getClipboardImage(this)
        if (imgPath === 'no image') {
          throw new Error('image not found in clipboard')
        } else {
          this.once('failed', async () => {
            if (!isExistFile) {
              await fs.remove(imgPath)
            }
          })
          this.once('finished', async () => {
            if (!isExistFile) {
              await fs.remove(imgPath)
            }
          })
          await this.lifecycle.start([imgPath])
        }
      } catch (e) {
        this.log.error(e)
        this.emit('failed', e)
        throw e
      }
    } else {
      // upload from path
      await this.lifecycle.start(input)
    }
  }
}

export default PicGo
