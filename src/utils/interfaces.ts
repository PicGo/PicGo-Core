import PicGo from '../core/PicGo'
import LifecyclePlugins from '../lib/LifecyclePlugins'

/**
 * for plugin config
 */
interface PluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  [propName: string]: any
}

/**
 * for lifecycle plugins
 */
interface Helper {
  transformer: LifecyclePlugins
  uploader: LifecyclePlugins
  beforeTransformPlugins: LifecyclePlugins
  beforeUploadPlugins: LifecyclePlugins
  afterUploadPlugins: LifecyclePlugins
}

/**
 * for uploading image info
 */
interface ImgInfo {
  buffer?: Buffer
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  extname?: string
  [propName: string]: any
}

/**
 * for config options
 */
interface Config {
  [propName: string]: any
}

/**
 * for plugin
 */
interface Plugin {
  handle (ctx: PicGo): void | Promise<any>
  [propName: string]: any
}

/**
 * for spawn output
 */
interface Result {
  code: string | number
  data: string
}

/**
 * for transformer - path
 */
interface ImgSize {
  width: number
  height: number
}

/**
 * for initUtils
 */
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

/**
 * for clipboard image
 */
interface ClipboardImage {
  imgPath: string
  isExistFile: boolean
}

/**
 * for install command environment variable
 */
interface ProcessEnv {
  [propName: string]: string | undefined
}
export {
  PluginConfig,
  ImgInfo,
  Config,
  Helper,
  Plugin,
  Result,
  ImgSize,
  Options,
  ClipboardImage,
  ProcessEnv
}
