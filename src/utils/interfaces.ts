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

export {
  PluginConfig,
  ImgInfo,
  Config,
  Helper,
  Plugin,
  Result,
  ImgSize
}
