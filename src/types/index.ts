import { Command } from 'commander'
import { Inquirer } from 'inquirer'
import { IRequestPromiseOptions } from './oldRequest'

export interface IPicGo extends NodeJS.EventEmitter {
  /**
   * picgo configPath
   *
   * if do not provide, then it will use default configPath
   */
  configPath: string
  /**
   * the picgo configPath's baseDir
   */
  baseDir: string
  /**
   * picgo logger factory
   */
  log: ILogger
  /**
   * picgo commander, for cli
   */
  cmd: ICommander
  /**
   * after transformer, the input will be output
   */
  output: IImgInfo[]
  /**
   * the origin input
   */
  input: any[]
  /**
   * register\unregister\get picgo's plugin
   */
  pluginLoader: IPluginLoader
  /**
   * install\uninstall\update picgo's plugin via npm
   */
  pluginHandler: IPluginHandler
  /**
   * @deprecated will be removed in v1.5.0+
   *
   * use request instead.
   *
   * http request tool
   */
  Request: IRequest
  /**
   * plugin system core part transformer\uploader\beforeTransformPlugins...
   */
  helper: IHelper
  /**
   * picgo-core version
   */
  VERSION: string
  /**
   * electron picgo's version
   */
  GUI_VERSION?: string
  /**
   * will be released in v1.5.0+
   *
   * replace old Request
   *
   * http request tool
   */
  request: IRequest['request']

  i18n: II18nManager

  /**
   * get picgo config
   */
  getConfig: <T>(name?: string) => T
  /**
   * save picgo config to configPath
   */
  saveConfig: (config: IStringKeyMap<any>) => void
  /**
   * remove some [propName] in config[key] && save config to configPath
   */
  removeConfig: (key: string, propName: string) => void
  /**
   * set picgo config to ctx && will not save to configPath
   */
  setConfig: (config: IStringKeyMap<any>) => void
  /**
   * unset picgo config to ctx && will not save to configPath
   */
  unsetConfig: (key: string, propName: string) => void
  /**
   * upload gogogo
   */
  upload: (input?: any[]) => Promise<IImgInfo[] | Error>
}

/**
 * for plugin config
 */
export interface IPluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  alias?: string
  message?: string
  prefix?: string // for cli options
  [propName: string]: any
}

/**
 * for lifecycle plugins
 */
export interface ILifecyclePlugins {
  register: (id: string, plugin: IPlugin) => void
  unregister: (id: string) => void
  getName: () => string
  get: (id: string) => IPlugin | undefined
  getList: () => IPlugin[]
  getIdList: () => string[]
}

export interface IHelper {
  transformer: ILifecyclePlugins
  uploader: ILifecyclePlugins
  beforeTransformPlugins: ILifecyclePlugins
  beforeUploadPlugins: ILifecyclePlugins
  afterUploadPlugins: ILifecyclePlugins
}

export interface ICommander extends ILifecyclePlugins {
  program: Command
  inquirer: Inquirer
}

export interface IPluginLoader {
  /**
   * register [local plugin] or [provided plugin]
   *
   * if the second param (plugin) is provided
   *
   * then picgo will register this plugin and enable it by default
   *
   * but picgo won't write any config to config file
   *
   * you should use ctx.setConfig to change the config context
   */
  registerPlugin: (name: string, plugin?: IPicGoPlugin) => void
  unregisterPlugin: (name: string) => void
  getPlugin: (name: string) => IPicGoPluginInterface | undefined
  /**
   * get enabled plugin list
   */
  getList: () => string[]
  /**
   * get all plugin list (enabled or not)
   */
  getFullList: () => string[]
  hasPlugin: (name: string) => boolean
}

export interface IRequestOld {
  request: import('axios').AxiosInstance
}

export type IOldReqOptions = Omit<IRequestPromiseOptions & {
  url: string
}, 'auth'>

export type IOldReqOptionsWithFullResponse = IOldReqOptions & {
  resolveWithFullResponse: true
}

export type IOldReqOptionsWithJSON = IOldReqOptions & {
  json: true
}

/**
 * for PicGo new request api, the response will be json format
 */
export type IReqOptions<T = any> = AxiosRequestConfig<T> & {
  resolveWithFullResponse: true
}

/**
 * for PicGo new request api, the response will be Buffer
 */
export type IReqOptionsWithArrayBufferRes<T = any> = IReqOptions<T> & {
  responseType: 'arraybuffer'
}

/**
 * for PicGo new request api, the response will be just response data. (not statusCode, headers, etc.)
 */
export type IReqOptionsWithBodyResOnly<T = any> = AxiosRequestConfig<T>

export type IFullResponse<T = any, U = any> = AxiosResponse<T, U> & {
  statusCode: number
  body: T
}

type AxiosResponse<T = any, U = any> = import('axios').AxiosResponse<T, U>

type AxiosRequestConfig<T = any> = import('axios').AxiosRequestConfig<T>

interface IRequestOptionsWithFullResponse {
  resolveWithFullResponse: true
}

interface IRequestOptionsWithJSON {
  json: true
}

interface IRequestOptionsWithResponseTypeArrayBuffer {
  responseType: 'arraybuffer'
}

/**
 * T is the response data type
 * U is the config type
 */
export type IResponse<T, U> = U extends IRequestOptionsWithFullResponse ? IFullResponse<T, U>
  : U extends IRequestOptionsWithJSON ? T
    : U extends IRequestOptionsWithResponseTypeArrayBuffer ? Buffer
      : U extends IOldReqOptionsWithFullResponse ? IFullResponse<T, U>
        : U extends IOldReqOptionsWithJSON ? T
          : U extends IOldReqOptions ? string
            : U extends IReqOptionsWithBodyResOnly ? T
              : string

/**
 * the old request lib will be removed in v1.5.0+
 * the request options have the following properties
 */
export interface IRequestLibOnlyOptions {
  proxy?: string
  body?: any
  formData?: { [key: string]: any } | undefined
  form?: { [key: string]: any } | string | undefined
}

export type IRequestConfig<T> = T extends IRequestLibOnlyOptions ? IOldReqOptions : AxiosRequestConfig

// export type INewRequest<T = any, U = any> = (config: IRequestConfig<T>) => Promise<IResponse<T, U>>

export interface IRequest {
  request: <T, U extends (
    IRequestConfig<U> extends IOldReqOptions ? IOldReqOptions : IRequestConfig<U> extends AxiosRequestConfig ? AxiosRequestConfig : never
  )>(config: U) => Promise<IResponse<T, U>>
}

export type ILogColor = 'blue' | 'green' | 'yellow' | 'red'

/**
 * for uploading image info
 */
export interface IImgInfo {
  buffer?: Buffer
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  extname?: string
  imgUrl?: string
  [propName: string]: any
}

export interface IPathTransformedImgInfo extends IImgInfo {
  success: boolean
}

export interface IStringKeyMap<T> {
  [key: string]: T extends T ? T : any
}

export interface ICLIConfigs {
  [module: string]: IStringKeyMap<any>
}

/** SM.MS 图床配置项 */
export interface ISmmsConfig {
  token: string
  backupDomain?: string
}
/** 七牛云图床配置项 */
export interface IQiniuConfig {
  accessKey: string
  secretKey: string
  /** 存储空间名 */
  bucket: string
  /** 自定义域名 */
  url: string
  /** 存储区域编号 */
  area: 'z0' | 'z1' | 'z2' | 'na0' | 'as0' | string
  /** 网址后缀，比如使用 `?imageslim` 可进行[图片瘦身](https://developer.qiniu.com/dora/api/1271/image-thin-body-imageslim) */
  options: string
  /** 自定义存储路径，比如 `img/` */
  path: string
}
/** 又拍云图床配置项 */
export interface IUpyunConfig {
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
export interface ITcyunConfig {
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
  /** 针对图片的一些后缀处理参数 PicGo 2.4.0+ PicGo-Core 1.5.0+ */
  options: string
}
/** GitHub 图床配置项 */
export interface IGithubConfig {
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
export interface IAliyunConfig {
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
export interface IImgurConfig {
  /** imgur 的 `clientId` */
  clientId: string
  /** 代理地址，仅支持 http 代理 */
  proxy: string
}
/** PicGo 配置文件类型定义 */
export interface IConfig {
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
    /** for uploader */
    proxy?: string
    [others: string]: any
  }
  picgoPlugins: {
    [pluginName: string]: boolean
  }
  debug?: boolean
  silent?: boolean
  settings?: {
    logLevel?: string
    logPath?: string
    /** for npm */
    registry?: string
    /** for npm */
    proxy?: string
    [others: string]: any
  }
  [configOptions: string]: any
}

/**
 * for an uploader/transformer/beforeTransformHandler/beforeUploadHandler/afterUploadHandler
 */
export interface IPlugin {
  handle: ((ctx: IPicGo) => Promise<any>) | ((ctx: IPicGo) => void)
  /** The name of this handler */
  name?: string
  /** The config of this handler */
  config?: (ctx: IPicGo) => IPluginConfig[]
  [propName: string]: any
}

export type IPluginNameType = 'simple' | 'scope' | 'normal' | 'unknown'

export interface IPluginProcessResult {
  success: boolean
  /**
   * the package.json's name filed
   */
  pkgName: string
  /**
   * the plugin name or the fs absolute path
   */
  fullName: string
}

export interface IPluginHandler {
  install: (plugins: string[], options: IPluginHandlerOptions, env?: IProcessEnv) => Promise<IPluginHandlerResult<boolean>>
  update: (plugins: string[], options: IPluginHandlerOptions, env?: IProcessEnv) => Promise<IPluginHandlerResult<boolean>>
  uninstall: (plugins: string[]) => Promise<IPluginHandlerResult<boolean>>
}

export interface IPluginHandlerResult<T> {
  success: T
  body: T extends true ? string[] : string
}

export interface IPluginHandlerOptions {
  proxy?: string
  registry?: string
}

/**
 * for picgo npm plugins
 */
export type IPicGoPlugin = (ctx: IPicGo) => IPicGoPluginInterface

/**
 * interfaces for PicGo plugin
 */
export interface IPicGoPluginInterface {
  /**
   * since PicGo-Core v1.5, register will inject ctx
   */
  register: (ctx: IPicGo) => void
  /**
   * this plugin's config
   */
  config?: (ctx: IPicGo) => IPluginConfig[]
  /**
   * register uploader name
   */
  uploader?: string
  /**
   * register transformer name
   */
  transformer?: string
  /**
   * for picgo gui plugins
   */
  guiMenu?: (ctx: IPicGo) => IGuiMenuItem[]

  /**
   * for picgo gui plugins
   * short key -> command
   */
  commands?: (ctx: IPicGo) => ICommandItem[]

  [propName: string]: any
}

export interface IGuiMenuItem {
  label: string
  handle: (ctx: IPicGo, guiApi: any) => Promise<void>
}

export interface ICommandItem {
  label: string
  name: string
  key: string
  handle: (ctx: IPicGo, guiApi: any) => Promise<void>
}

/**
 * for spawn output
 */
export interface IResult {
  code: number
  data: string
}

/**
 * for transformer - path
 */
export interface IImgSize {
  width: number
  height: number
  real?: boolean
}

/**
 * for initUtils
 */
export interface IFileTree {
  [filePath: string]: string | Buffer
}

export interface IOptions {
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
export interface IClipboardImage {
  imgPath: string
  /**
   * if the path is generate by picgo -> false
   * if the path is a real file path in system -> true
   */
  shouldKeepAfterUploading: boolean
}

/**
 * for install command environment variable
 */
export interface IProcessEnv {
  [propName: string]: Undefinable<string>
}

export type ILogArgvType = string | number

export type ILogArgvTypeWithError = ILogArgvType | Error

export type Nullable<T> = T | null
export type Undefinable<T> = T | undefined

export interface ILogger {
  success: (...msg: ILogArgvType[]) => void
  info: (...msg: ILogArgvType[]) => void
  error: (...msg: ILogArgvTypeWithError[]) => void
  warn: (...msg: ILogArgvType[]) => void
  debug: (...msg: ILogArgvType[]) => void
}

export interface IConfigChangePayload<T> {
  configName: string
  value: T
}

export interface ILocale {
  [key: string]: any
}

export interface II18nManager {
  /**
   * translate text
   */
  translate: <T extends string>(key: T, args?: IStringKeyMap<string>) => string
  /**
   * add locale to current i18n language
   * default locale list
   * - zh-CN
   * - en
   */
  addLocale: (language: string, locales: ILocale) => boolean
  /**
   * set current language
   */
  setLanguage: (language: string) => void
  /**
   * dynamic add new language & locales
   */
  addLanguage: (language: string, locales: ILocale) => boolean
  /**
   * get language list
   */
  getLanguageList: () => string[]
}
