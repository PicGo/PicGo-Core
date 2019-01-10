import PicGo from '../core/PicGo'
import LifecyclePlugins from '../lib/LifecyclePlugins'

interface PluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  [propName: string]: any
}

interface Helper {
  transformer: LifecyclePlugins
  uploader: LifecyclePlugins
  beforeTransformPlugins: LifecyclePlugins
  beforeUploadPlugins: LifecyclePlugins
  afterUploadPlugins: LifecyclePlugins
}

interface ImgInfo {
  buffer?: Buffer
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  extname?: string
  [propName: string]: any
}

interface Config {
  [propName: string]: any
}

interface Plugin {
  handle (ctx: PicGo): void | Promise<any>
  [propName: string]: any
}

// for spawn output
interface Result {
  code: string | number
  data: string
}

// for transformer - path
interface ImgSize {
  width: number
  height: number
}

// for initUtils
interface Options {
  template: string // template name
  dest: string // destination for template to generate
  hasSlash: boolean // check if is officail template
  inPlace: boolean // check if is given project name
  clone: boolean // check if use git clone
  offline: boolean // check if use offline mode
  tmp: string // cache template
  project: string // project name
}

export {
  PluginConfig,
  ImgInfo,
  Config,
  Helper,
  Plugin,
  Result,
  ImgSize,
  Options
}
