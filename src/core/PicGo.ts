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
import { saveConfig, initConfig } from '../utils/config'
import PluginLoader from '../lib/PluginLoader'
import { get, set } from 'lodash'
import { Helper, ImgInfo, Config } from '../utils/interfaces'
import getClipboardImage from '../utils/getClipboardImage'
import Request from '../lib/Request'

class PicGo extends EventEmitter {
  configPath: string
  baseDir: string
  helper: Helper
  log: Logger
  cmd: Commander
  config: Config
  output: ImgInfo[]
  input: any[]
  pluginLoader: PluginLoader
  Request: Request
  private lifecycle: Lifecycle

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
    this.init()
  }

  init (): void {
    if (this.configPath === '') {
      this.configPath = homedir() + '/.picgo/config.json'
    }
    this.baseDir = path.dirname(this.configPath)
    const exist = fs.pathExistsSync(this.configPath)
    if (!exist) {
      fs.ensureFileSync(`${this.configPath}`)
    }
    try {
      // init config
      const config = initConfig(this.configPath).read().value()
      this.config = config
      // load self plugins
      this.Request = new Request(this)
      this.pluginLoader = new PluginLoader(this)
      uploaders(this)
      transformers(this)
      // load third-party plugins
      this.pluginLoader.load()
      this.lifecycle = new Lifecycle(this)
    } catch (e) {
      this.emit('uploadProgress', -1)
      this.log.error(e)
      Promise.reject(e)
    }
  }

  // register commandline commands
  // please mannually remove listeners for avoiding listeners memory leak
  registerCommands (): void {
    this.cmd.init()
    this.cmd.loadCommands()
  }

  // get config
  getConfig (name: string = ''): any {
    if (name) {
      return get(this.config, name)
    } else {
      return this.config
    }
  }

  // save to db
  saveConfig (config: any): void {
    saveConfig(this.configPath, config)
    this.setConfig(config)
  }

  // set config for ctx but will not be saved to db
  // it's more lightweight
  setConfig (config: any): void {
    Object.keys(config).forEach((name: string) => {
      set(this.config, name, config[name])
    })
  }

  async upload (input?: any[]): Promise<void> {
    // upload from clipboard
    if (input === undefined || input.length === 0) {
      try {
        const imgPath = await getClipboardImage(this)
        if (imgPath === 'no image') {
          this.emit('notification', {
            title: 'image not found in clipboard',
            body: 'copy image first'
          })
          this.log.warn('no image to upload')
        } else {
          this.once('failed', async () => {
            await fs.remove(imgPath)
          })
          this.once('finished', async () => {
            await fs.remove(imgPath)
          })
          await this.lifecycle.start([imgPath])
        }
      } catch (e) {
        this.log.error(e)
        throw e
      }
    } else {
      // upload from path
      await this.lifecycle.start(input)
    }
  }
}

export default PicGo
