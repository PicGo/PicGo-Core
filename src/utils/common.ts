import fs from 'fs-extra'
import path from 'path'
import { imageSize } from 'image-size'
import {
  IImgSize,
  IPathTransformedImgInfo,
  IPluginNameType,
  ILogger,
  IPicGo
} from '../types'
import { URL } from 'url'

export const isUrl = (url: string): boolean => (url.startsWith('http://') || url.startsWith('https://'))
export const isUrlEncode = (url: string): boolean => {
  url = url || ''
  try {
    // the whole url encode or decode shold not use encodeURIComponent or decodeURIComponent
    return url !== decodeURI(url)
  } catch (e) {
    // if some error caught, try to let it go
    return false
  }
}
export const handleUrlEncode = (url: string): string => {
  if (!isUrlEncode(url)) {
    url = encodeURI(url)
  }
  return url
}

export const getImageSize = (file: Buffer): IImgSize => {
  try {
    const { width = 0, height = 0 } = imageSize(file)
    return {
      real: true,
      width,
      height
    }
  } catch (e) {
    // fallback to 200 * 200
    return {
      real: false,
      width: 200,
      height: 200
    }
  }
}

export const getFSFile = async (filePath: string): Promise<IPathTransformedImgInfo> => {
  try {
    return {
      extname: path.extname(filePath),
      fileName: path.basename(filePath),
      buffer: await fs.readFile(filePath),
      success: true
    }
  } catch {
    return {
      reason: `read file ${filePath} error`,
      success: false
    }
  }
}

export const getURLFile = async (url: string, ctx: IPicGo): Promise<IPathTransformedImgInfo> => {
  url = handleUrlEncode(url)
  let isImage = false
  let extname = ''
  let timeoutId: NodeJS.Timeout
  const requestFn = new Promise<IPathTransformedImgInfo>((resolve, reject) => {
    (async () => {
      try {
        const res = await ctx.request({
          method: 'get',
          url,
          resolveWithFullResponse: true,
          responseType: 'arraybuffer'
        })
          .then((resp) => {
            const contentType = resp.headers['content-type']
            if (contentType?.includes('image')) {
              isImage = true
              extname = `.${contentType.split('image/')[1]}`
            }
            return resp.data as Buffer
          })
        clearTimeout(timeoutId)
        if (isImage) {
          const urlPath = new URL(url).pathname
          resolve({
            buffer: res,
            fileName: path.basename(urlPath),
            extname,
            success: true
          })
        } else {
          resolve({
            success: false,
            reason: `${url} is not image`
          })
        }
      } catch (error: any) {
        clearTimeout(timeoutId)
        resolve({
          success: false,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          reason: `request ${url} error, ${error?.message ?? ''}`
        })
      }
    })().catch(reject)
  })
  const timeoutPromise = new Promise<IPathTransformedImgInfo>((resolve): void => {
    timeoutId = setTimeout(() => {
      resolve({
        success: false,
        reason: `request ${url} timeout`
      })
    }, 10000)
  })
  return Promise.race([requestFn, timeoutPromise])
}

/**
 * detect the input string's type
 * for example
 * 1. @xxx/picgo-plugin-xxx -> scope
 * 2. picgo-plugin-xxx -> normal
 * 3. xxx -> simple
 * 4. not exists or is a path -> unknown
 * @param name
 */
export const getPluginNameType = (name: string): IPluginNameType => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return 'scope'
  } else if (name.startsWith('picgo-plugin-')) {
    return 'normal'
  } else if (isSimpleName(name)) {
    return 'simple'
  }
  return 'unknown'
}

/**
 * detect the input string is a simple plugin name or not
 * for example
 * 1. xxx -> true
 * 2. /Usr/xx/xxxx/picgo-plugin-xxx -> false
 * @param name pluginNameOrPath
 */
export const isSimpleName = (nameOrPath: string): boolean => {
  if (path.isAbsolute(nameOrPath)) {
    return false
  }
  const pluginPath = path.join(process.cwd(), nameOrPath)
  if (fs.existsSync(pluginPath)) {
    return false
  }
  if (nameOrPath.includes('/') || nameOrPath.includes('\\')) {
    return false
  }
  return true
}

/**
 * streamline the full plugin name to a simple one
 * for example:
 * 1. picgo-plugin-xxx -> xxx
 * 2. @xxx/picgo-plugin-yyy -> yyy
 * @param name pluginFullName
 */
export const handleStreamlinePluginName = (name: string): string => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return name.replace(/^@[^/]+\/picgo-plugin-/, '')
  } else {
    return name.replace(/picgo-plugin-/, '')
  }
}

/**
 * complete plugin name to full name
 * for example:
 * 1. xxx -> picgo-plugin-xxx
 * 2. picgo-plugin-xxx -> picgo-plugin-xxx
 * @param name pluginSimpleName
 * @param scope pluginScope
 */
export const handleCompletePluginName = (name: string, scope = ''): string => {
  if (scope) {
    return `@${scope}/picgo-plugin-${name}`
  } else {
    return `picgo-plugin-${name}`
  }
}

/**
 * handle install/uninstall/update plugin name or path
 * for example
 * 1. picgo-plugin-xxx -> picgo-plugin-xxx
 * 2. @xxx/picgo-plugin-xxx -> @xxx/picgo-plugin-xxx
 * 3. xxx -> picgo-plugin-xxx
 * 4. ./xxxx/picgo-plugin-xxx -> /absolutePath/.../xxxx/picgo-plugin-xxx
 * 5. /absolutePath/.../picgo-plugin-xxx -> /absolutePath/.../picgo-plugin-xxx
 * @param nameOrPath pluginName or pluginPath
 */
export const getProcessPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
    case 'scope':
      return nameOrPath
    case 'simple':
      return handleCompletePluginName(nameOrPath)
    default: {
      // now, the pluginNameType is unknow here
      // 1. check if is an absolute path
      let pluginPath = nameOrPath
      if (path.isAbsolute(nameOrPath) && fs.existsSync(nameOrPath)) {
        return handleUnixStylePath(pluginPath)
      }
      // 2. check if is a relative path
      pluginPath = path.join(process.cwd(), nameOrPath)
      if (fs.existsSync(pluginPath)) {
        return handleUnixStylePath(pluginPath)
      }
      // 3. invalid nameOrPath
      logger.warn(`Can't find plugin ${nameOrPath}`)
      return ''
    }
  }
}

/**
 * get the normal plugin name
 * for example:
 * 1. picgo-plugin-xxx -> picgo-plugin-xxx
 * 2. @xxx/picgo-plugin-xxx -> @xxx/picgo-plugin-xxx
 * 3. ./xxxx/picgo-plugin-xxx -> picgo-plugin-xxx
 * 4. /absolutePath/.../picgo-plugin-xxx -> picgo-plugin-xxx
 * 5. an exception: [package.json's name] !== [folder name]
 * then use [package.json's name], usually match the scope package.
 * 6. if plugin name has version: picgo-plugin-xxx@x.x.x then remove the version
 * @param nameOrPath
 */
export const getNormalPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
      return removePluginVersion(nameOrPath)
    case 'scope':
      return removePluginVersion(nameOrPath, true)
    case 'simple':
      return removePluginVersion(handleCompletePluginName(nameOrPath))
    default: {
      // now, the nameOrPath must be path
      // the nameOrPath here will be ensured with unix style
      // we need to find the package.json's name cause npm using the name in package.json's name filed
      if (!fs.existsSync(nameOrPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      }
      const packageJSONPath = path.posix.join(nameOrPath, 'package.json')
      if (!fs.existsSync(packageJSONPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      } else {
        const pkg = fs.readJSONSync(packageJSONPath) || {}
        if (!pkg.name?.includes('picgo-plugin-')) {
          logger.warn(`The plugin package.json's name filed is ${pkg.name as string || 'empty'}, need to include the prefix: picgo-plugin-`)
          return ''
        }
        return pkg.name
      }
    }
  }
}

/**
 * handle transform the path to unix style
 * for example
 * 1. C:\\xxx\\xxx -> C:/xxx/xxx
 * 2. /xxx/xxx -> /xxx/xxx
 * @param path
 */
export const handleUnixStylePath = (pathStr: string): string => {
  const pathArr = pathStr.split(path.sep)
  return pathArr.join('/')
}

/**
 * remove plugin version when register plugin name
 * 1. picgo-plugin-xxx@1.0.0 -> picgo-plugin-xxx
 * 2. @xxx/picgo-plugin-xxx@1.0.0 -> @xxx/picgo-plugin-xxx
 * @param nameOrPath
 * @param scope
 */
export const removePluginVersion = (nameOrPath: string, scope: boolean = false): string => {
  if (!nameOrPath.includes('@')) {
    return nameOrPath
  } else {
    let reg = /(.+\/)?(picgo-plugin-\w+)(@.+)*/
    // if is a scope pkg
    if (scope) {
      reg = /(.+\/)?(^@[^/]+\/picgo-plugin-\w+)(@.+)*/
    }
    const matchArr = nameOrPath.match(reg)
    if (!matchArr) {
      console.warn('can not remove plugin version')
      return nameOrPath
    } else {
      return matchArr[2]
    }
  }
}

/**
 * the config black item list which won't be setted
 * only can be got
 */
export const configBlackList = []

/**
 * check some config key is in blackList
 * @param key
 */
export const isConfigKeyInBlackList = (key: string): boolean => {
  return configBlackList.some(blackItem => key.startsWith(blackItem))
}

/**
 * check the input config is valid
 * config must be object such as { xxx: 'xxx' }
 * && can't be array
 * @param config
 * @returns
 */
export const isInputConfigValid = (config: any): boolean => {
  if (
    typeof config === 'object' &&
    !Array.isArray(config) &&
    Object.keys(config).length > 0
  ) {
    return true
  }
  return false
}

export function safeParse<T> (str: string): T | string {
  try {
    return JSON.parse(str)
  } catch (error) {
    return str
  }
}

// hold...
// export const configWhiteList: RegExp[] = [
//   /^picBed/,
//   /^picgoPlugins/,
//   /^@[^/]+\/picgo-plugin-/,
//   /debug/,
//   /silent/,
//   /configPath/,
//   /^settings/,
// ]

// export const isConfigKeyInWhiteList = (key: string): boolean => {
//   return configWhiteList.some(whiteItem => whiteItem.test(key))
// }

export const forceNumber = (num: string | number = 0): number => {
  return isNaN(Number(num)) ? 0 : Number(num)
}

export const isDev = (): boolean => {
  return process.env.NODE_ENV === 'development'
}

export const isProd = (): boolean => {
  return process.env.NODE_ENV === 'production'
}
