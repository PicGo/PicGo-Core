import PicGo from '../core/PicGo'
import LifecyclePlugins from '../lib/LifecyclePlugins'

/**
 * for plugin config
 */
export interface PluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  [propName: string]: any
}

/**
 * for lifecycle plugins
 */
export interface Helper {
  transformer: LifecyclePlugins
  uploader: LifecyclePlugins
  beforeTransformPlugins: LifecyclePlugins
  beforeUploadPlugins: LifecyclePlugins
  afterUploadPlugins: LifecyclePlugins
}

/**
 * for uploading image info
 */
export interface ImgInfo {
  buffer?: Buffer
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  extname?: string
  [propName: string]: any
}

export interface IPathTransformedImgInfo extends ImgInfo {
  success: boolean
}

/**
 * for config options
 */
export interface Config {
  [propName: string]: any
}

/**
 * for plugin
 */
export interface Plugin {
  handle (ctx: PicGo): void | Promise<any>
  [propName: string]: any
}

/**
 * for spawn output
 */
export interface Result {
  code: string | number
  data: string
}

/**
 * for transformer - path
 */
export interface ImgSize {
  width: number
  height: number
  real?: boolean
}

/**
 * for initUtils
 */
export interface Options {
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
export interface ClipboardImage {
  imgPath: string
  isExistFile: boolean
}

/**
 * for install command environment variable
 */
export interface ProcessEnv {
  [propName: string]: string | undefined
}

export type ILogArgvType = string | number

export type ILogArgvTypeWithError = ILogArgvType | Error
