import 'dotenv/config'
import { applyUrlRewriteToImgInfo } from './utils/urlRewrite'

export { PicGo } from './core/PicGo'
export { Lifecycle } from './core/Lifecycle'

export { Logger } from './lib/Logger'
export { PluginHandler } from './lib/PluginHandler'
export { LifecyclePlugins } from './lib/LifecyclePlugins'
export { Commander } from './lib/Commander'
export { PluginLoader } from './lib/PluginLoader'
export { Request } from './lib/Request'
export { ServerManager } from './lib/Server'
export { CloudManager } from './lib/Cloud'
export {
  ConfigSyncManager,
  SyncStatus,
  ConflictType,
  E2EVersion,
  E2EAskPinReason,
  EncryptionMethod,
  CorruptedDataError,
  UnsupportedVersionError,
  MissingHandlerError,
  InvalidPinError,
  MaxRetryExceededError,
  DecryptionFailedError
} from './lib/ConfigSyncManager'
export { ConfigMerger } from './lib/ConfigSyncManager/Merger'
export type {
  ConfigValue,
  IDiffNode,
  IMergeResult,
  ISyncResult,
  ISnapshot,
  IE2EPayload,
  ISyncConfigResponse,
  ISyncOptions,
  IApplyResolvedOptions
} from './lib/ConfigSyncManager/types'

import * as PicGoCommonUtils from './utils/common'

export const PicGoUtils = {
  ...PicGoCommonUtils,
  applyUrlRewriteToImgInfo
}

export * from './types'
export * from './utils/enum'
