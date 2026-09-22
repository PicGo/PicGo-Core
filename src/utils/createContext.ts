import { cloneDeep, get, set, unset } from 'lodash'
import type { ILocalesKey } from '../i18n/zh-CN'
import { IConfig, IPicGo, ResolvedUploadOption } from '../types'
import { isConfigKeyInBlackList, isInputConfigValid } from './common'

const createUploadConfigMethods = (ctx: IPicGo, option: ResolvedUploadOption): Pick<IPicGo, 'getConfig' | 'saveConfig' | 'removeConfig' | 'setConfig' | 'unsetConfig'> => {
  const config = cloneDeep(ctx.getConfig<IConfig>())

  set(config, 'picBed.uploader', option.uploader)
  set(config, 'picBed.current', option.uploader)
  if (option.config !== undefined) {
    set(config, `picBed.${option.uploader}`, cloneDeep(option.config))
  }

  const getConfig = <T = unknown>(name?: string): T => {
    if (!name) return config as unknown as T
    return get(config, name) as T
  }

  const applyConfigPatch = (patch: Parameters<IPicGo['setConfig']>[0]): void => {
    if (!isInputConfigValid(patch)) {
      ctx.log.warn(ctx.i18n.translate<ILocalesKey>('CONFIG_INVALID_FORMAT'))
      return
    }
    Object.keys(patch).forEach((name: string) => {
      if (isConfigKeyInBlackList(name)) {
        ctx.log.warn(ctx.i18n.translate<ILocalesKey>('CONFIG_KEY_READ_ONLY', { name }))
        return
      }
      const value = cloneDeep(patch[name])
      set(config, name, value)
    })
  }

  const setConfig: IPicGo['setConfig'] = (patch): void => {
    applyConfigPatch(patch)
  }

  const unsetConfig = (key: string, propName: string): void => {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      ctx.log.warn(ctx.i18n.translate<ILocalesKey>('CONFIG_KEY_CANNOT_UNSET', { key }))
      return
    }
    unset(get(config, key), propName)
  }

  const saveConfig: IPicGo['saveConfig'] = (patch): void => {
    if (!isInputConfigValid(patch)) {
      ctx.saveConfig(patch)
      return
    }
    ctx.saveConfig(cloneDeep(patch))
    applyConfigPatch(cloneDeep(patch))
  }

  const removeConfig = (key: string, propName: string): void => {
    ctx.removeConfig(key, propName)
    if (!key || !propName || isConfigKeyInBlackList(key)) return
    unsetConfig(key, propName)
  }

  return {
    getConfig,
    saveConfig,
    removeConfig,
    setConfig,
    unsetConfig
  }
}

/**
 * create an unique context for each upload process
 * @param ctx
 */
export const createContext = (ctx: IPicGo, option?: ResolvedUploadOption): IPicGo => {
  const configMethods = option === undefined
    ? {
      getConfig: ctx.getConfig.bind(ctx),
      saveConfig: ctx.saveConfig.bind(ctx),
      removeConfig: ctx.removeConfig.bind(ctx),
      setConfig: ctx.setConfig.bind(ctx),
      unsetConfig: ctx.unsetConfig.bind(ctx)
    }
    : createUploadConfigMethods(ctx, option)

  return {
    configPath: ctx.configPath,
    baseDir: ctx.baseDir,
    log: ctx.log,
    cmd: ctx.cmd,
    server: ctx.server,
    cloud: ctx.cloud,
    uploaderConfig: ctx.uploaderConfig,
    output: [],
    input: [],
    pluginLoader: ctx.pluginLoader,
    pluginHandler: ctx.pluginHandler,
    Request: ctx.Request,
    helper: ctx.helper,
    VERSION: ctx.VERSION,
    GUI_VERSION: ctx.GUI_VERSION,
    request: ctx.request,
    openUrl: ctx.openUrl.bind(ctx),
    i18n: ctx.i18n,
    ...configMethods,
    upload: ctx.upload.bind(ctx),
    addListener: ctx.addListener.bind(ctx),
    on: ctx.on.bind(ctx),
    once: ctx.once.bind(ctx),
    removeListener: ctx.removeListener.bind(ctx),
    off: ctx.off.bind(ctx),
    removeAllListeners: ctx.removeAllListeners.bind(ctx),
    setMaxListeners: ctx.setMaxListeners.bind(ctx),
    getMaxListeners: ctx.getMaxListeners.bind(ctx),
    listeners: ctx.listeners.bind(ctx),
    rawListeners: ctx.rawListeners.bind(ctx),
    emit: ctx.emit.bind(ctx),
    listenerCount: ctx.listenerCount.bind(ctx),
    prependListener: ctx.prependListener.bind(ctx),
    prependOnceListener: ctx.prependOnceListener.bind(ctx),
    eventNames: ctx.eventNames.bind(ctx)
  }
}
