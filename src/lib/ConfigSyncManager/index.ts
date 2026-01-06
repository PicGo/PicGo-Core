import fs from 'fs-extra'
import path from 'path'
import { parse, stringify } from 'comment-json'
import { cloneDeep, get, isEqual, isPlainObject, set, unset } from 'lodash'
import type { IPicGo, IConfig } from '../../types'
import { ConfigService } from '../Cloud/services/ConfigService'
import { ConfigMerger } from './Merger'
import type { ConfigValue, ISnapshot, ISyncResult } from './types'
import { SyncStatus } from './types'

const IGNORED_CONFIG_PATHS = ['settings.picgoCloud.token']

interface ISnapshotLike {
  version: number
  updatedAt?: string
  data: ConfigValue
}

const isSnapshotLike = (value: ConfigValue): value is ISnapshotLike => {
  if (!isPlainObject(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.version === 'number' &&
    Object.prototype.hasOwnProperty.call(record, 'data')
  )
}

export class ConfigSyncManager {
  private readonly ctx: IPicGo
  private readonly snapshotPath: string
  private readonly configService: ConfigService
  private currentRemoteVersion: number = 0
  private originalRemote: IConfig | null = null

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.snapshotPath = path.join(ctx.baseDir, 'config.snapshot.json')
    this.configService = new ConfigService(ctx)
  }

  private maskIgnoredFields (target: IConfig, source: IConfig): IConfig {
    const result = cloneDeep(target)

    IGNORED_CONFIG_PATHS.forEach((ignoredPath: string) => {
      const sourceValue = get(source, ignoredPath)
      if (sourceValue !== undefined) {
        set(result, ignoredPath, sourceValue)
      } else {
        unset(result, ignoredPath)
      }
    })

    return result
  }

  async sync (retryCount: number = 0): Promise<ISyncResult> {
    try {
      const localConfig = await this.readConfigWithComments(this.ctx.configPath)
      if (!isPlainObject(localConfig)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Local config is not a valid JSON object'
        }
      }

      const snapshotExists = await fs.pathExists(this.snapshotPath)
      const snapshot = await this.loadSnapshot()
      const fetchedRemote = await this.fetchRemoteConfig()
      if (fetchedRemote && !isPlainObject(fetchedRemote)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Remote config is not a valid JSON object'
        }
      }
      this.originalRemote = fetchedRemote ? fetchedRemote as IConfig : null

      // HANDLE MISSING REMOTE (First Run OR Remote Deleted)
      // Strategy: If remote is missing, we treat Local as the absolute truth.
      // We re-seed the remote with Local data and update the snapshot.
      // This protects local changes even if the sync chain was broken.
      if (!this.originalRemote) {
        const isFirstRun = !snapshotExists

        if (isFirstRun) {
          this.ctx.log.info('First time sync detected. Initializing remote config...')
        } else {
          this.ctx.log.warn('Remote config missing (sync chain broken). Re-initializing from Local...')
        }

        // 1. Push Local -> Remote (Re-seed)
        try {
          await this.pushRemoteConfig(localConfig as IConfig)
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e)
          if (message === 'Remote config modified by another device') {
            if (retryCount < 1) {
              this.ctx.log.warn('Conflict detected during sync. Retrying automatically...')
              return this.sync(retryCount + 1)
            }
            return {
              status: SyncStatus.FAILED,
              message: 'Sync failed: Remote config is changing too frequently. Please try again later.'
            }
          }
          throw e
        }

        // 2. Update Snapshot (Establish new baseline)
        await this.saveSnapshot(localConfig, this.currentRemoteVersion)

        return {
          status: SyncStatus.SUCCESS,
          message: isFirstRun ? 'Config sync initialized' : 'Remote config restored from local',
          mergedConfig: localConfig as IConfig
        }
      }

      // Step A: Pre-Merge Masking (ignored fields)
      const effectiveRemote = this.maskIgnoredFields(this.originalRemote, localConfig as IConfig)

      // Step B: Merge
      const mergeRes = ConfigMerger.merge3Way(snapshot.data, localConfig, effectiveRemote)

      if (mergeRes.conflict) {
        return {
          status: SyncStatus.CONFLICT,
          message: 'Config sync conflict detected',
          diffTree: mergeRes.diffNode
        }
      }

      const mergedConfig = mergeRes.value as IConfig

      // Step C: Write Local
      const shouldWriteLocal = !isEqual(localConfig, mergedConfig)

      if (shouldWriteLocal) {
        await this.writeConfigWithComments(this.ctx.configPath, mergedConfig)
      }

      // Step D: Prepare Push (restore remote ignored fields)
      const configToPush = this.maskIgnoredFields(mergedConfig, this.originalRemote)
      const shouldPushRemote = !isEqual(this.originalRemote, configToPush)

      if (shouldPushRemote) {
        try {
          await this.pushRemoteConfig(configToPush)
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e)
          if (message === 'Remote config modified by another device') {
            if (retryCount < 1) {
              this.ctx.log.warn('Conflict detected during sync. Retrying automatically...')
              return this.sync(retryCount + 1)
            }
            return {
              status: SyncStatus.FAILED,
              message: 'Sync failed: Remote config is changing too frequently. Please try again later.'
            }
          }
          throw e
        }
      }

      await this.saveSnapshot(mergedConfig, this.currentRemoteVersion)

      return {
        status: SyncStatus.SUCCESS,
        message: 'Config sync success',
        mergedConfig
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        status: SyncStatus.FAILED,
        message
      }
    }
  }

  async applyResolvedConfig (resolvedConfig: IConfig): Promise<ISyncResult> {
    try {
      if (!isPlainObject(resolvedConfig)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Resolved config is not a valid JSON object'
        }
      }

      const currentLocalConfig = await this.readConfigWithComments(this.ctx.configPath)
      if (!isPlainObject(currentLocalConfig)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Local config is not a valid JSON object'
        }
      }

      // 1) Mask for disk: keep local ignored fields
      const configToWrite = this.maskIgnoredFields(resolvedConfig, currentLocalConfig as IConfig)

      // 2) Write to disk
      await this.writeConfigWithComments(this.ctx.configPath, configToWrite)

      // 3) Mask for cloud: keep original remote ignored fields
      if (!this.originalRemote) {
        const fetchedRemote = await this.fetchRemoteConfig()
        if (fetchedRemote && !isPlainObject(fetchedRemote)) {
          return {
            status: SyncStatus.FAILED,
            message: 'Remote config is not a valid JSON object'
          }
        }
        this.originalRemote = fetchedRemote ? fetchedRemote as IConfig : null
      }

      const configToPush = this.originalRemote
        ? this.maskIgnoredFields(configToWrite, this.originalRemote)
        : configToWrite

      // 4) Push to cloud
      await this.pushRemoteConfig(configToPush)

      // 5) Snapshot should match disk state
      await this.saveSnapshot(configToWrite, this.currentRemoteVersion)

      return {
        status: SyncStatus.SUCCESS,
        message: 'Config conflict resolved',
        mergedConfig: configToWrite
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        status: SyncStatus.FAILED,
        message
      }
    }
  }

  private async readConfigWithComments (filePath: string): Promise<ConfigValue> {
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf8')
      return parse(content)
    }
    return {}
  }

  private async writeConfigWithComments (filePath: string, config: ConfigValue): Promise<void> {
    const content = stringify(config, null, 2)
    await fs.writeFile(filePath, content, 'utf8')
  }

  private async loadSnapshot (): Promise<ISnapshot> {
    if (!(await fs.pathExists(this.snapshotPath))) {
      return {
        version: 0,
        updatedAt: '',
        data: {}
      }
    }

    const raw = await this.readConfigWithComments(this.snapshotPath)
    if (isSnapshotLike(raw)) {
      return {
        version: raw.version,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
        data: raw.data ?? {}
      }
    }

    // Legacy snapshot (plain object)
    return {
      version: 0,
      updatedAt: '',
      data: raw
    }
  }

  private async saveSnapshot (config: ConfigValue, version: number): Promise<void> {
    await this.writeConfigWithComments(this.snapshotPath, {
      version,
      updatedAt: new Date().toISOString(),
      data: config
    })
  }

  private async fetchRemoteConfig (): Promise<ConfigValue | null> {
    const res = await this.configService.fetchConfig()
    if (!res) {
      this.currentRemoteVersion = 0
      return null
    }
    this.currentRemoteVersion = res.version
    return parse(res.config)
  }

  private async pushRemoteConfig (config: IConfig): Promise<void> {
    const res = await this.configService.updateConfig(stringify(config, null, 2), this.currentRemoteVersion)
    if (res.conflict) {
      this.currentRemoteVersion = res.version
      throw new Error('Remote config modified by another device')
    }
    this.currentRemoteVersion = res.version
  }
}

export type { IDiffNode } from './types'
export { SyncStatus, ConflictType } from './types'
