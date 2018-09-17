import fs from 'fs-extra'
import path from 'path'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import Commander from '../lib/Commander'
import Logger from './Logger'
import Lifecycle from './Lifecycle'
import LifecyclePlugins from '../lib/LifecyclePlugins'
// plugin loaders
import uploaders from '../plugins/uploader'
import transformers from '../plugins/transformer'
import commanders from '../plugins/commander'
import { saveConfig, getConfig } from '../utils/config'
import PluginLoader from '../lib/PluginLoader'
import { get, set } from 'lodash'
import { Helper, ImgInfo, Config } from '../utils/interfaces'

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

  init () {
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
      const config = getConfig(this.configPath).read().value()
      this.config = config
      // load self plugins
      this.pluginLoader = new PluginLoader(this)
      uploaders(this)
      transformers(this)
      commanders(this)
      // load third-party plugins
      this.pluginLoader.load()
      this.lifecycle = new Lifecycle(this)
    } catch (e) {
      this.emit('uploadProgress', -1)
      this.log.error(e)
      Promise.reject(e)
    }
  }

  // get config
  getConfig (name: string = '') {
    if (name) {
      return get(this.config, name)
    } else {
      return this.config
    }
  }

  // save to db
  saveConfig (config) {
    saveConfig(this.configPath, config)
    this.setConfig(config)
  }

  // set config for ctx but will not be saved to db
  // it's more lightweight
  setConfig (config) {
    Object.keys(config).forEach(name => {
      set(this.config, name, config[name])
    })
  }

  async upload (input: any[]) {
    await this.lifecycle.start(input)
  }
}

export default PicGo
