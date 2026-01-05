import fs from 'fs-extra'
import path from 'path'
import { parse, stringify } from 'comment-json'
import { isEqual, isPlainObject } from 'lodash'
import type { IPicGo, IConfig } from '../../types'
import { ConfigService } from '../Cloud/services/ConfigService'
import { ConfigMerger } from './Merger'
import type { ConfigValue, ISnapshot, ISyncResult } from './types'
import { SyncStatus } from './types'

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

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.snapshotPath = path.join(ctx.baseDir, 'config.snapshot.json')
    this.configService = new ConfigService(ctx)
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
      const remoteConfig = await this.fetchRemoteConfig()

      // HANDLE MISSING REMOTE (First Run OR Remote Deleted)
      // Strategy: If remote is missing, we treat Local as the absolute truth.
      // We re-seed the remote with Local data and update the snapshot.
      // This protects local changes even if the sync chain was broken.
      if (!remoteConfig) {
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

      const mergeRes = ConfigMerger.merge3Way(snapshot.data, localConfig, remoteConfig)

      if (mergeRes.conflict) {
        return {
          status: SyncStatus.CONFLICT,
          message: 'Config sync conflict detected',
          diffTree: mergeRes.diffNode
        }
      }

      const mergedConfig = mergeRes.value as IConfig
      const shouldWriteLocal = !isEqual(localConfig, mergedConfig)
      const shouldPushRemote = !isEqual(remoteConfig, mergedConfig)

      if (shouldWriteLocal) {
        await this.writeConfigWithComments(this.ctx.configPath, mergedConfig)
      }

      if (shouldPushRemote) {
        try {
          await this.pushRemoteConfig(mergedConfig)
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

      await this.writeConfigWithComments(this.ctx.configPath, resolvedConfig)
      await this.pushRemoteConfig(resolvedConfig)
      await this.saveSnapshot(resolvedConfig, this.currentRemoteVersion)

      return {
        status: SyncStatus.SUCCESS,
        message: 'Config conflict resolved',
        mergedConfig: resolvedConfig
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
