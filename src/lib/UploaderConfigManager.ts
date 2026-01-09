import { isEqual } from 'lodash'
import { IPicGo, IStringKeyMap, IUploaderConfigItem, IUploaderConfigManager, IUploaderTypeConfigs, Undefinable } from '../types'
import { uuid } from '../utils/uuid'

const RESERVED_PICBED_KEYS = new Set([
  'current',
  'uploader',
  'transformer',
  'proxy',
  'list'
])

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const normalizeName = (name: string): string => name.trim()

const toCompareName = (name: string): string => normalizeName(name).toLowerCase()

export class UploaderConfigManager implements IUploaderConfigManager {
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.init()
  }

  private init (): void {
    const picBedRaw = this.ctx.getConfig<unknown>('picBed')
    const uploaderRaw = this.ctx.getConfig<unknown>('uploader')

    const picBed = isPlainObject(picBedRaw) ? picBedRaw : {}
    const uploader = isPlainObject(uploaderRaw) ? uploaderRaw : {}

    const types = new Set<string>()
    for (const key of Object.keys(picBed)) {
      if (!RESERVED_PICBED_KEYS.has(key)) types.add(key)
    }
    for (const key of Object.keys(uploader)) {
      types.add(key)
    }

    for (const type of types) {
      this.migrateNormalizeAndSync(type)
    }
  }

  listUploaderTypes (): string[] {
    return this.ctx.helper.uploader.getIdList()
  }

  getConfigList (type: string): IUploaderConfigItem[] {
    const store = this.readTypeStore(type)
    return store.configList
  }

  getActiveConfig (type: string): IUploaderConfigItem | undefined {
    const store = this.readTypeStore(type)
    return this.getActiveConfigFromStore(store)
  }

  use (type: string, configName?: string): IUploaderConfigItem {
    this.assertUploaderTypeExists(type)

    const store = this.readTypeStore(type)

    if (store.configList.length === 0) {
      return this.createOrUpdate(type, configName, {})
    }

    const normalizedName = typeof configName === 'string' ? normalizeName(configName) : ''
    if (normalizedName) {
      const match = this.findConfigByName(store.configList, normalizedName)
      if (!match) {
        throw new Error(`Config ${configName} not found in type ${type}`)
      }
      return this.activate(type, store, match._id)
    }

    const { store: normalizedStore, changed } = this.normalizeTypeStore(store)
    const active = this.getActiveConfigFromStore(normalizedStore)
    if (!active) {
      return this.createOrUpdate(type, configName, {})
    }

    return this.persistTypeAndMirror(type, normalizedStore, active, {
      setCurrent: true,
      persistStore: changed
    })
  }

  createOrUpdate (type: string, configName?: string, configPatch: IStringKeyMap<unknown> = {}): IUploaderConfigItem {
    this.assertUploaderTypeExists(type)

    const store = this.readTypeStore(type)
    const now = Date.now()

    const desiredName = typeof configName === 'string' ? normalizeName(configName) : ''

    const existing = desiredName ? this.findConfigByName(store.configList, desiredName) : undefined

    if (existing) {
      const next: IUploaderConfigItem = {
        ...existing,
        ...configPatch,
        _id: existing._id,
        _configName: existing._configName,
        _createdAt: existing._createdAt,
        _updatedAt: now
      }
      const nextList = store.configList.map(item => item._id === existing._id ? next : item)
      const nextStore: IUploaderTypeConfigs = {
        configList: nextList,
        defaultId: next._id
      }
      return this.persistTypeAndMirror(type, nextStore, next, { setCurrent: true, persistStore: true })
    }

    const finalName = desiredName ? this.ensureUniqueNameOrThrow(store.configList, desiredName) : this.generateDefaultName(store.configList)
    const created: IUploaderConfigItem = {
      ...configPatch,
      _id: uuid(),
      _configName: finalName,
      _createdAt: now,
      _updatedAt: now
    }
    const nextStore: IUploaderTypeConfigs = {
      configList: [...store.configList, created],
      defaultId: created._id
    }
    return this.persistTypeAndMirror(type, nextStore, created, { setCurrent: true, persistStore: true })
  }

  copy (type: string, configName: string, newConfigName: string): IUploaderConfigItem {
    this.assertUploaderTypeExists(type)

    const rawStore = this.readTypeStore(type)
    const normalized = this.normalizeTypeStore(rawStore)
    const store = normalized.store

    const sourceName = normalizeName(configName)
    const target = this.findConfigByName(store.configList, sourceName)
    if (!target) {
      throw new Error(`Config ${configName} not found in type ${type}`)
    }

    const desiredName = normalizeName(newConfigName)
    if (!desiredName) {
      throw new Error('Config name can not be empty')
    }

    const finalName = this.ensureUniqueNameOrThrow(store.configList, desiredName)

    const now = Date.now()
    const copied: IUploaderConfigItem = {
      ...target,
      _id: uuid(),
      _configName: finalName,
      _createdAt: now,
      _updatedAt: now
    }

    const nextStore: IUploaderTypeConfigs = {
      configList: [...store.configList, copied],
      defaultId: store.defaultId
    }

    const patch: Record<string, unknown> = {
      [`uploader.${type}`]: nextStore
    }

    const active = this.getActiveConfigFromStore(nextStore)
    if (active) {
      const currentMirror = this.ctx.getConfig<unknown>(`picBed.${type}`)
      if (!isEqual(currentMirror, active)) {
        patch[`picBed.${type}`] = active
      }
    }

    this.ctx.saveConfig(patch)
    return copied
  }

  rename (type: string, oldName: string, newName: string): IUploaderConfigItem {
    this.assertUploaderTypeExists(type)

    const store = this.readTypeStore(type)
    const oldNormalized = normalizeName(oldName)
    const newNormalized = normalizeName(newName)
    if (!newNormalized) {
      throw new Error('Config name can not be empty')
    }

    const target = this.findConfigByName(store.configList, oldNormalized)
    if (!target) {
      throw new Error(`Config ${oldName} not found in type ${type}`)
    }

    this.ensureUniqueNameOrThrow(store.configList, newNormalized, target._id)

    const now = Date.now()
    const next: IUploaderConfigItem = {
      ...target,
      _configName: newNormalized,
      _updatedAt: now
    }
    const nextList = store.configList.map(item => item._id === target._id ? next : item)
    const nextStore: IUploaderTypeConfigs = {
      configList: nextList,
      defaultId: store.defaultId
    }

    const isActive = store.defaultId === target._id
    if (isActive) {
      this.persistTypeAndMirror(type, nextStore, next, {
        setCurrent: false,
        persistStore: true
      })
      return next
    }

    this.ctx.saveConfig({
      [`uploader.${type}`]: nextStore
    })
    return next
  }

  remove (type: string, configName: string): void {
    this.assertUploaderTypeExists(type)

    const store = this.readTypeStore(type)
    const normalizedName = normalizeName(configName)

    const target = this.findConfigByName(store.configList, normalizedName)
    if (!target) {
      throw new Error(`Config ${configName} not found in type ${type}`)
    }

    const remaining = store.configList.filter(item => item._id !== target._id)
    if (remaining.length === 0) {
      this.ctx.saveConfig({
        [`uploader.${type}`]: {
          configList: [],
          defaultId: ''
        }
      })
      this.ctx.removeConfig('picBed', type)
      if (this.ctx.getConfig<Undefinable<string>>('picBed.current') === type) {
        this.ctx.log.warn(`You are currently using ${type} but have deleted its last config. Please switch to another uploader or create a new config.`)
      }
      return
    }

    const nextDefaultId = store.defaultId === target._id ? remaining[0]._id : store.defaultId
    const nextStore: IUploaderTypeConfigs = {
      configList: remaining,
      defaultId: nextDefaultId
    }

    const active = this.getActiveConfigFromStore(nextStore)
    if (!active) {
      this.ctx.saveConfig({
        [`uploader.${type}`]: nextStore
      })
      return
    }
    this.persistTypeAndMirror(type, nextStore, active, { setCurrent: false, persistStore: true })
  }

  private migrateNormalizeAndSync (type: string): void {
    const legacy = this.ctx.getConfig<unknown>(`picBed.${type}`)

    let store = this.readTypeStore(type)
    let storeChanged = false

    if (store.configList.length === 0 && isPlainObject(legacy)) {
      const now = Date.now()
      const migrated: IUploaderConfigItem = {
        ...legacy,
        _id: typeof legacy._id === 'string' && legacy._id.trim() ? legacy._id : uuid(),
        _configName: typeof legacy._configName === 'string' && normalizeName(legacy._configName) ? normalizeName(legacy._configName) : 'Default',
        _createdAt: typeof legacy._createdAt === 'number' ? legacy._createdAt : now,
        _updatedAt: typeof legacy._updatedAt === 'number' ? legacy._updatedAt : now
      }
      store = {
        configList: [migrated],
        defaultId: migrated._id
      }
      storeChanged = true
    }

    const normalized = this.normalizeTypeStore(store)
    store = normalized.store
    storeChanged = storeChanged || normalized.changed

    const patch: Record<string, unknown> = {}

    if (storeChanged) {
      patch[`uploader.${type}`] = store
    }

    const active = this.getActiveConfigFromStore(store)
    if (active) {
      const currentMirror = this.ctx.getConfig<unknown>(`picBed.${type}`)
      if (!isEqual(currentMirror, active)) {
        patch[`picBed.${type}`] = active
      }
    }

    if (Object.keys(patch).length > 0) {
      this.ctx.saveConfig(patch)
    }
  }

  private assertUploaderTypeExists (type: string): void {
    const types = this.listUploaderTypes()
    if (!types.includes(type)) {
      throw new Error(`Type ${type} not found`)
    }
  }

  private readTypeStore (type: string): IUploaderTypeConfigs {
    const raw = this.ctx.getConfig<unknown>(`uploader.${type}`)
    if (!isPlainObject(raw)) {
      return {
        configList: [],
        defaultId: ''
      }
    }
    const configListRaw = raw.configList
    const defaultIdRaw = raw.defaultId
    const configList: IUploaderConfigItem[] = []
    if (Array.isArray(configListRaw)) {
      for (const item of configListRaw) {
        if (isPlainObject(item)) {
          configList.push(item as IUploaderConfigItem)
        }
      }
    }
    return {
      configList,
      defaultId: typeof defaultIdRaw === 'string' ? defaultIdRaw : ''
    }
  }

  private normalizeTypeStore (store: IUploaderTypeConfigs): {
    store: IUploaderTypeConfigs
    changed: boolean
  } {
    const now = Date.now()
    let changed = false

    const usedNames = new Set<string>()
    const usedIds = new Set<string>()

    const normalizedList: IUploaderConfigItem[] = store.configList.map((item) => {
      const next: IUploaderConfigItem = { ...item }

      const rawId = typeof next._id === 'string' && next._id.trim() ? next._id : uuid()
      let finalId = rawId
      while (usedIds.has(finalId)) {
        finalId = uuid()
      }
      if (finalId !== next._id) {
        next._id = finalId
        changed = true
      }
      usedIds.add(finalId)

      const createdAt = typeof next._createdAt === 'number' ? next._createdAt : now
      const updatedAt = typeof next._updatedAt === 'number' ? next._updatedAt : now
      if (createdAt !== next._createdAt) {
        next._createdAt = createdAt
        changed = true
      }
      if (updatedAt !== next._updatedAt) {
        next._updatedAt = updatedAt
        changed = true
      }

      const baseName = typeof next._configName === 'string' ? normalizeName(next._configName) : ''
      let finalName = baseName || this.generateDefaultNameFromUsed(usedNames)
      let compareName = toCompareName(finalName)
      if (usedNames.has(compareName)) {
        const suffixBase = finalName
        let suffix = 1
        while (usedNames.has(toCompareName(`${suffixBase}-${suffix}`))) {
          suffix++
        }
        finalName = `${suffixBase}-${suffix}`
        compareName = toCompareName(finalName)
        next._updatedAt = now
        changed = true
      }
      if (finalName !== next._configName) {
        next._configName = finalName
        changed = true
      }
      usedNames.add(compareName)

      return next
    })

    let defaultId = store.defaultId
    if (normalizedList.length > 0) {
      const found = normalizedList.some(item => item._id === defaultId)
      if (!found) {
        defaultId = normalizedList[0]._id
        changed = true
      }
    } else {
      if (defaultId !== '') {
        defaultId = ''
        changed = true
      }
    }

    return {
      store: {
        configList: normalizedList,
        defaultId
      },
      changed
    }
  }

  private generateDefaultName (list: IUploaderConfigItem[]): string {
    const used = new Set<string>(list.map(item => toCompareName(item._configName)))
    return this.generateDefaultNameFromUsed(used)
  }

  private generateDefaultNameFromUsed (used: Set<string>): string {
    const base = 'Default'
    if (!used.has(toCompareName(base))) return base
    let suffix = 1
    while (used.has(toCompareName(`${base}-${suffix}`))) {
      suffix++
    }
    return `${base}-${suffix}`
  }

  private ensureUniqueNameOrThrow (list: IUploaderConfigItem[], desiredName: string, excludeId?: string): string {
    const normalizedDesired = normalizeName(desiredName)
    if (!normalizedDesired) {
      throw new Error('Config name can not be empty')
    }
    const desiredLower = toCompareName(normalizedDesired)
    const collision = list.some(item => item._id !== excludeId && toCompareName(item._configName) === desiredLower)
    if (collision) {
      throw new Error(`Config name ${desiredName} already exists`)
    }
    return normalizedDesired
  }

  private findConfigByName (list: IUploaderConfigItem[], name: string): IUploaderConfigItem | undefined {
    const target = toCompareName(name)
    return list.find(item => toCompareName(item._configName) === target)
  }

  private getActiveConfigFromStore (store: IUploaderTypeConfigs): IUploaderConfigItem | undefined {
    if (!store.defaultId) return store.configList[0]
    const match = store.configList.find(item => item._id === store.defaultId)
    return match ?? store.configList[0]
  }

  private activate (type: string, store: IUploaderTypeConfigs, id: string): IUploaderConfigItem {
    const active = store.configList.find(item => item._id === id)
    if (!active) {
      throw new Error(`Config not found for type ${type}`)
    }
    const nextStore: IUploaderTypeConfigs = {
      configList: store.configList,
      defaultId: id
    }
    return this.persistTypeAndMirror(type, nextStore, active, { setCurrent: true, persistStore: true })
  }

  private persistTypeAndMirror (
    type: string,
    store: IUploaderTypeConfigs,
    active: IUploaderConfigItem | undefined,
    options: { setCurrent: boolean, persistStore: boolean }
  ): IUploaderConfigItem {
    const patch: Record<string, unknown> = {}
    if (options.persistStore) {
      patch[`uploader.${type}`] = store
    }
    if (active) {
      patch[`picBed.${type}`] = active
    }
    if (options.setCurrent) {
      patch['picBed.current'] = type
      patch['picBed.uploader'] = type
    }
    this.ctx.saveConfig(patch)
    if (active) return active
    const fallback = store.configList[0]
    if (!fallback) {
      throw new Error(`No configs found in type ${type}`)
    }
    return fallback
  }
}
