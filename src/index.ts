import { applyUrlRewriteToImgInfo } from './utils/urlRewrite'

export { PicGo } from './core/PicGo'
export { Lifecycle } from './core/Lifecycle'

export { Logger } from './lib/Logger'
export { PluginHandler } from './lib/PluginHandler'
export { LifecyclePlugins } from './lib/LifecyclePlugins'
export { Commander } from './lib/Commander'
export { PluginLoader } from './lib/PluginLoader'
export { Request } from './lib/Request'

import * as PicGoCommonUtils from './utils/common'

export const PicGoUtils = {
  ...PicGoCommonUtils,
  applyUrlRewriteToImgInfo
}

export * from './types'
export * from './utils/enum'
