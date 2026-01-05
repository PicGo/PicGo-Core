import fs from 'fs-extra'
import path from 'path'
import { parse, stringify } from 'comment-json'
import { isEqual, isPlainObject } from 'lodash'
import type { IPicGo, IConfig } from '../../types'
import { ConfigMerger } from './Merger'
import type { ConfigValue, ISyncResult } from './types'
import { SyncStatus } from './types'

export class ConfigSyncManager {
  private readonly ctx: IPicGo
  private readonly snapshotPath: string

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.snapshotPath = path.join(ctx.baseDir, 'config.snapshot.json')
  }

  async sync (): Promise<ISyncResult> {
    try {
      const localConfig = await this.readConfigWithComments(this.ctx.configPath)
      if (!isPlainObject(localConfig)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Local config is not a valid JSON object'
        }
      }

      const snapshotExists = await fs.pathExists(this.snapshotPath)
      const snapshotConfig = snapshotExists ? await this.loadSnapshot() : undefined
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
        await this.pushRemoteConfig(localConfig as IConfig)

        // 2. Update Snapshot (Establish new baseline)
        await this.saveSnapshot(localConfig)

        return {
          status: SyncStatus.SUCCESS,
          message: isFirstRun ? 'Config sync initialized' : 'Remote config restored from local',
          mergedConfig: localConfig as IConfig
        }
      }

      const mergeRes = ConfigMerger.merge3Way(snapshotConfig ?? {}, localConfig, remoteConfig as unknown as ConfigValue)

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

      await this.saveSnapshot(mergedConfig)

      if (shouldPushRemote) {
        await this.pushRemoteConfig(mergedConfig)
      }

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
      await this.saveSnapshot(resolvedConfig)
      await this.pushRemoteConfig(resolvedConfig)

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

  private async loadSnapshot (): Promise<ConfigValue> {
    return this.readConfigWithComments(this.snapshotPath)
  }

  private async saveSnapshot (config: ConfigValue): Promise<void> {
    await this.writeConfigWithComments(this.snapshotPath, config)
  }

  private async fetchRemoteConfig (): Promise<IConfig | null> { return null }
  private async pushRemoteConfig (_config: IConfig): Promise<void> {}
}

export type { IDiffNode } from './types'
export { SyncStatus, ConflictType } from './types'
