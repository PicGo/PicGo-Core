import PicGo from '../core/PicGo'
import LifecyclePlugins from '../lib/LifecyclePlugins'
import Logger from 'src/lib/Logger'
import Commander from 'src/lib/Commander'
import PluginHandler from 'src/lib/PluginHandler'
import PluginLoader from 'src/lib/PluginLoader'
import Request from 'src/lib/Request'

interface IPicGo extends NodeJS.EventEmitter {
  configPath: string
  baseDir: string
  log: Logger
  cmd: Commander
  output: IImgInfo[]
  input: any[]
  pluginLoader: PluginLoader
  pluginHandler: PluginHandler
  Request: Request
  helper: IHelper

  registerCommands: () => void
  getConfig: <T>(name?: string) => T
  saveConfig: (config: IStringKeyMap<any>) => void
  removeConfig: (key: string, propName: string) => void
  setConfig: (config: IStringKeyMap<any>) => void
  unsetConfig: (key: string, propName: string) => void
  upload: (input?: any[]) => Promise<IImgInfo[] | Error>
}

/**
 * for plugin config
 */
interface IPluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  [propName: string]: any
}

/**
 * for lifecycle plugins
 */
interface IHelper {
  transformer: LifecyclePlugins
  uploader: LifecyclePlugins
  beforeTransformPlugins: LifecyclePlugins
  beforeUploadPlugins: LifecyclePlugins
  afterUploadPlugins: LifecyclePlugins
}

type ILogColor = 'blue' | 'green' | 'yellow' | 'red'

/**
 * for uploading image info
 */
interface IImgInfo {
  buffer?: Buffer
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  extname?: string
  [propName: string]: any
}

interface IPathTransformedImgInfo extends IImgInfo {
  success: boolean
}

interface IStringKeyMap<T> {
  [key: string]: T extends T ? T : any
}

interface ICLIConfigs {
  [module: string]: IStringKeyMap
}

/** SM.MS 图床配置项 */
interface ISmmsConfig {
  token: string
}
/** 七牛云图床配置项 */
interface IQiniuConfig {
  accessKey: string
  secretKey: string
  /** 存储空间名 */
  bucket: string
  /** 自定义域名 */
  url: string
  /** 存储区域编号 */
  area: 'z0' | 'z1' | 'z2' | 'na0' | 'as0'
  /** 网址后缀，比如使用 `?imageslim` 可进行[图片瘦身](https://developer.qiniu.com/dora/api/1271/image-thin-body-imageslim) */
  options: string
  /** 自定义存储路径，比如 `img/` */
  path: string
}
/** 又拍云图床配置项 */
interface IUpyunConfig {
  /** 存储空间名，及你的服务名 */
  bucket: string
  /** 操作员 */
  operator: string
  /** 密码 */
  password: string
  /** 针对图片的一些后缀处理参数 */
  options: string
  /** 自定义存储路径，比如 `img/` */
  path: string
  /** 加速域名，注意要加 `http://` 或者 `https://` */
  url: string
}
/** 腾讯云图床配置项 */
interface ITcyunConfig {
  secretId: string
  secretKey: string
  /** 存储桶名，v4 和 v5 版本不一样 */
  bucket: string
  appId: string
  /** 存储区域，例如 ap-beijing-1 */
  area: string
  /** 自定义存储路径，比如 img/ */
  path: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  customUrl: string
  /** COS 版本，v4 或者 v5 */
  version: 'v5' | 'v4'
}
/** GitHub 图床配置项 */
interface IGithubConfig {
  /** 仓库名，格式是 `username/reponame` */
  repo: string
  /** github token */
  token: string
  /** 自定义存储路径，比如 `img/` */
  path: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  customUrl: string
  /** 分支名，默认是 `main` */
  branch: string
}
/** 阿里云图床配置项 */
interface IAliyunConfig {
  accessKeyId: string
  accessKeySecret: string
  /** 存储空间名 */
  bucket: string
  /** 存储区域代号 */
  area: string
  /** 自定义存储路径 */
  path: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  customUrl: string
  /** 针对图片的一些后缀处理参数 PicGo 2.2.0+ PicGo-Core 1.4.0+ */
  options: string
}
/** Imgur 图床配置项 */
interface IImgurConfig {
  /** imgur 的 `clientId` */
  clientId: string
  /** 代理地址，仅支持 http 代理 */
  proxy: string
}
/** PicGo 配置文件类型定义 */
interface IConfig {
  picBed: {
    uploader: string
    current?: string
    smms?: ISmmsConfig
    qiniu?: IQiniuConfig
    upyun?: IUpyunConfig
    tcyun?: ITcyunConfig
    github?: IGithubConfig
    aliyun?: IAliyunConfig
    imgur?: IImgurConfig
    transformer?: string
    proxy: string
  }
  picgoPlugins: {
    [propName: string]: boolean
  }
  debug?: boolean
  silent?: boolean
  settings?: {
    logLevel: string
    logPath: string
  }
  /** 下载插件时 npm 命令自定义的 registry */
  registry: string
  [configOptions: string]: any
}

/**
 * for plugin
 */
interface IPlugin {
  handle: ((ctx: PicGo) => Promise<any>) | ((ctx: PicGo) => void)
  [propName: string]: any
}

/**
 * for picgo npm plugins
 */

type IPicGoPlugin = (ctx: IPicGo) => IPicGoPluginInterface

/**
 * interfaces for PicGo plugin
 */
interface IPicGoPluginInterface {
  /**
   * since PicGo-Core v1.5, register will inject ctx
   */
  register: (ctx?: PicGo) => void
  /**
   * this plugin's config
   */
  config?: (ctx?: PicGo) => IPluginConfig[]
  /**
   * register uploader name
   */
  uploader?: string
  /**
   * register transformer name
   */
  transformer?: string
}

/**
 * for spawn output
 */
interface IResult {
  code: number
  data: string
}

/**
 * for transformer - path
 */
interface IImgSize {
  width: number
  height: number
  real?: boolean
}

/**
 * for initUtils
 */
interface IFileTree {
  [filePath: string]: string | Buffer
}

interface IOptions {
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
interface IClipboardImage {
  imgPath: string
  isExistFile: boolean
}

/**
 * for install command environment variable
 */
interface IProcessEnv {
  [propName: string]: Undefinable<string>
}

type ILogArgvType = string | number

type ILogArgvTypeWithError = ILogArgvType | Error

type Nullable<T> = T | null
type Undefinable<T> = T | undefined
