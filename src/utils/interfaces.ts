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

/** SM.MS 图床配置项 */
export interface SmmsConfig {
  token: string
}
export interface QiniuConfig {
  accessKey: string
  secretKey: string
  /** 存储空间名 */
  bucket: string
  /** 自定义域名 */
  url: string
  /** 存储区域编号 */
  area: 'z0' | 'z1' | 'z2' | 'na0' | 'as0'
  // TODO: 这里是什么意思？
  /** 网址后缀，比如？`imgslim` */
  options: string
  /** 自定义存储路径，比如 `img/` */
  path: string
}
/** 又拍云图床配置项 */
export interface UpyunConfig {
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
/** 又拍云图床配置项 */
export interface TcyunConfig {
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
export interface GithubConfig {
  /** 仓库名，格式是 `username/reponame` */
  repo: string
  /** github token */
  token: string
  /** 自定义存储路径，比如 `img/` */
  path: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  customUrl: string
  /** 分支名，默认是 `master` */
  branch: string
}
/** 阿里云图床配置项 */
export interface AliyunConfig {
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
export interface ImgurConfig {
  /** imgur 的 `clientId` */
  clientId: string
  /** 代理地址，仅支持 http 代理 */
  proxy: string
}
/**
 * for config options
 */
export interface Config {
  picBed: {
    uploader: string
    current: string
    smms?: SmmsConfig
    qiniu?: QiniuConfig
    upyun?: UpyunConfig
    tcyun?: TcyunConfig
    github?: GithubConfig
    aliyun?: AliyunConfig
    imgur?: ImgurConfig
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
}

/**
 * for plugin
 */
export interface Plugin {
  handle: ((ctx: PicGo) => Promise<any>) | ((ctx: PicGo) => void)
  [propName: string]: any
}

/**
 * for spawn output
 */
export interface Result {
  code: number
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
