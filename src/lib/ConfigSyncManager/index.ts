import fs from 'fs-extra'
import path from 'path'
import { parse, stringify } from 'comment-json'
import { isEqual, isPlainObject, set } from 'lodash'
import type { IPicGo, IConfig } from '../../types'
import { ConfigService } from '../Cloud/services/ConfigService'
import { ConfigMerger } from './Merger'
import { E2ECryptoService, requireClientDekEncrypted, requireClientKekSalt } from './E2ECryptoService'
import {
  getLocalEnableE2E,
  loadSnapshot,
  maskIgnoredFields,
  readConfigWithComments,
  resolveE2EVersion,
  resolveEncryptionIntent,
  saveSnapshot
} from './utils'
import type {
  ConfigValue,
  IApplyResolvedOptions,
  IE2ERequestFields,
  ISyncOptions,
  ISyncResult
} from './types'
import { E2EAskPinReason, E2EVersion, EncryptionIntent, SyncStatus } from './types'
import {
  CorruptedDataError,
  DecryptionFailedError,
  InvalidPinError,
  MaxRetryExceededError,
  MissingHandlerError
} from './errors'

const MAX_DECRYPT_ATTEMPTS = 4

interface IConfigSyncManagerOptions {
  onAskPin?: (reason: E2EAskPinReason, retryCount: number) => Promise<string | null>
}

export class ConfigSyncManager {
  private readonly ctx: IPicGo
  private readonly snapshotPath: string
  private readonly configService: ConfigService
  private readonly onAskPin?: (reason: E2EAskPinReason, retryCount: number) => Promise<string | null>
  private readonly e2eService: E2ECryptoService
  private currentRemoteVersion: number = 0
  private originalRemote: IConfig | null = null
  private remoteE2EVersion: E2EVersion = E2EVersion.NONE
  private remoteClientKekSalt?: string
  private remoteClientDekEncrypted?: string
  private cachedDEK?: Buffer
  private cachedClientDekEncrypted?: string

  constructor (ctx: IPicGo, options: IConfigSyncManagerOptions = {}) {
    this.ctx = ctx
    this.snapshotPath = path.join(ctx.baseDir, 'config.snapshot.json')
    this.configService = new ConfigService(ctx)
    this.onAskPin = options.onAskPin
    this.e2eService = new E2ECryptoService()
  }

  private async persistLocalEnableE2E (config: IConfig, enableE2E: boolean): Promise<IConfig> {
    const current = getLocalEnableE2E(config)
    if (current === enableE2E) {
      return config
    }
    set(config, 'settings.picgoCloud.enableE2E', enableE2E)
    this.ctx.saveConfig({
      'settings.picgoCloud.enableE2E': enableE2E
    })
    return config
  }

  async sync (options: ISyncOptions = {}, retryCount: number = 0): Promise<ISyncResult> {
    try {
      const localConfigValue = await readConfigWithComments(this.ctx.configPath)
      if (!isPlainObject(localConfigValue)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Local config is not a valid JSON object'
        }
      }
      let localConfig = localConfigValue as IConfig
      if (options.encryptionIntent === EncryptionIntent.FORCE_ENCRYPT || options.encryptionIntent === EncryptionIntent.FORCE_PLAIN) {
        const shouldEnableE2E = options.encryptionIntent === EncryptionIntent.FORCE_ENCRYPT
        localConfig = await this.persistLocalEnableE2E(localConfig, shouldEnableE2E)
      }
      const encryptionIntent = resolveEncryptionIntent(options.encryptionIntent, localConfig)

      const snapshotExists = await fs.pathExists(this.snapshotPath)
      const snapshot = await loadSnapshot(this.snapshotPath)
      const fetchedRemote = await this.fetchRemoteConfig()
      if (fetchedRemote && !isPlainObject(fetchedRemote)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Remote config is not a valid JSON object'
        }
      }
      this.originalRemote = fetchedRemote ? fetchedRemote as IConfig : null
      if (this.remoteE2EVersion === E2EVersion.V1 && getLocalEnableE2E(localConfig) === undefined) {
        localConfig = await this.persistLocalEnableE2E(localConfig, true)
      }

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
          const payload = await this.buildPushPayload(localConfig, encryptionIntent)
          await this.pushRemoteConfig(payload.configStr, payload.e2eFields)
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e)
          if (message === 'Remote config modified by another device') {
            if (retryCount < 1) {
              this.ctx.log.warn('Conflict detected during sync. Retrying automatically...')
              return this.sync(options, retryCount + 1)
            }
            return {
              status: SyncStatus.FAILED,
              message: 'Sync failed: Remote config is changing too frequently. Please try again later.'
            }
          }
          throw e
        }

        // 2. Update Snapshot (Establish new baseline)
        await saveSnapshot(this.snapshotPath, localConfig, this.currentRemoteVersion)

        return {
          status: SyncStatus.SUCCESS,
          message: isFirstRun ? 'Config sync initialized' : 'Remote config restored from local',
          mergedConfig: localConfig
        }
      }

      // Step A: Pre-Merge Masking (ignored fields)
      const effectiveRemote = maskIgnoredFields(this.originalRemote, localConfig)

      // Step B: Merge
      this.ctx.log.info('Merging configs for sync...')
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
        this.ctx.saveConfig(mergedConfig)
      }

      // Step D: Prepare Push (restore remote ignored fields)
      const configToPush = maskIgnoredFields(mergedConfig, this.originalRemote, { cleanupEmptyParents: true })
      const shouldPushRemote = this.shouldChangeE2E(encryptionIntent) || !isEqual(this.originalRemote, configToPush)

      if (shouldPushRemote) {
        try {
          const payload = await this.buildPushPayload(configToPush, encryptionIntent)
          await this.pushRemoteConfig(payload.configStr, payload.e2eFields)
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e)
          if (message === 'Remote config modified by another device') {
            if (retryCount < 1) {
              this.ctx.log.warn('Conflict detected during sync. Retrying automatically...')
              return this.sync(options, retryCount + 1)
            }
            return {
              status: SyncStatus.FAILED,
              message: 'Sync failed: Remote config is changing too frequently. Please try again later.'
            }
          }
          throw e
        }
      }

      await saveSnapshot(this.snapshotPath, mergedConfig, this.currentRemoteVersion)

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

  async applyResolvedConfig (resolvedConfig: IConfig, options: IApplyResolvedOptions = {}): Promise<ISyncResult> {
    try {
      if (!isPlainObject(resolvedConfig)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Resolved config is not a valid JSON object'
        }
      }

      const currentLocalConfig = await readConfigWithComments(this.ctx.configPath)
      if (!isPlainObject(currentLocalConfig)) {
        return {
          status: SyncStatus.FAILED,
          message: 'Local config is not a valid JSON object'
        }
      }

      // 1) Mask for disk: keep local ignored fields
      const configToWrite = maskIgnoredFields(resolvedConfig, currentLocalConfig as IConfig)

      // 2) Write to disk
      this.ctx.saveConfig(configToWrite)

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
        ? maskIgnoredFields(configToWrite, this.originalRemote, { cleanupEmptyParents: true })
        : configToWrite

      const useE2E = options.useE2E ?? (this.remoteE2EVersion === E2EVersion.V1)
      const encryptionIntent = useE2E ? EncryptionIntent.FORCE_ENCRYPT : EncryptionIntent.FORCE_PLAIN

      // 4) Push to cloud
      const payload = await this.buildPushPayload(configToPush, encryptionIntent)
      await this.pushRemoteConfig(payload.configStr, payload.e2eFields)

      // 5) Snapshot should match disk state
      await saveSnapshot(this.snapshotPath, configToWrite, this.currentRemoteVersion)

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

  private async fetchRemoteConfig (): Promise<ConfigValue | null> {
    this.ctx.log.info('Fetching remote config for sync...')
    const res = await this.configService.fetchConfig()
    if (!res) {
      this.currentRemoteVersion = 0
      this.setRemoteE2EState(E2EVersion.NONE)
      return null
    }
    this.currentRemoteVersion = res.version
    const e2eVersion = resolveE2EVersion(res.e2eVersion)

    if (e2eVersion === E2EVersion.V1) {
      const clientKekSalt = requireClientKekSalt(res)
      const clientDekEncrypted = requireClientDekEncrypted(res)
      this.setRemoteE2EState(E2EVersion.V1, clientKekSalt, clientDekEncrypted)
      const decryptedConfig = await this.decryptRemoteConfig(res.config, clientKekSalt, clientDekEncrypted)
      return parse(decryptedConfig)
    }

    this.setRemoteE2EState(E2EVersion.NONE)
    return parse(res.config)
  }

  private async pushRemoteConfig (configStr: string, e2eFields: IE2ERequestFields): Promise<void> {
    this.ctx.log.info('Pushing merged config to remote...')
    const res = await this.configService.updateConfig(configStr, this.currentRemoteVersion, e2eFields)
    if (res.conflict) {
      this.currentRemoteVersion = res.version
      throw new Error('Remote config modified by another device')
    }
    this.currentRemoteVersion = res.version
    this.applyE2EStateAfterPush(e2eFields)
  }

  private applyE2EStateAfterPush (e2eFields: IE2ERequestFields): void {
    if (e2eFields.e2eVersion === E2EVersion.V1 && e2eFields.clientKekSalt && e2eFields.clientDekEncrypted) {
      this.setRemoteE2EState(E2EVersion.V1, e2eFields.clientKekSalt, e2eFields.clientDekEncrypted)
      return
    }
    if (e2eFields.e2eVersion === E2EVersion.NONE) {
      this.setRemoteE2EState(E2EVersion.NONE)
    }
  }

  private setRemoteE2EState (version: E2EVersion, clientKekSalt?: string, clientDekEncrypted?: string): void {
    this.remoteE2EVersion = version
    this.remoteClientKekSalt = clientKekSalt
    this.remoteClientDekEncrypted = clientDekEncrypted
    if (!clientDekEncrypted || clientDekEncrypted !== this.cachedClientDekEncrypted) {
      this.cachedDEK = undefined
      this.cachedClientDekEncrypted = undefined
    }
  }


  private async buildPushPayload (config: IConfig, intent: EncryptionIntent): Promise<{ configStr: string, e2eFields: IE2ERequestFields }> {
    const plainConfig = stringify(config, null, 2)
    const useE2E = this.shouldUseE2E(intent)

    if (!useE2E) {
      return {
        configStr: plainConfig,
        e2eFields: { e2eVersion: E2EVersion.NONE }
      }
    }

    if (this.remoteE2EVersion === E2EVersion.V1 && this.remoteClientKekSalt && this.remoteClientDekEncrypted) {
      const dek = await this.ensureDEK(this.remoteClientKekSalt, this.remoteClientDekEncrypted)
      return {
        configStr: this.e2eService.encryptConfig(plainConfig, dek),
        e2eFields: {
          e2eVersion: E2EVersion.V1,
          clientKekSalt: this.remoteClientKekSalt,
          clientDekEncrypted: this.remoteClientDekEncrypted
        }
      }
    }

    const pin = await this.askPin(E2EAskPinReason.SETUP, 0)
    const { payload, dek } = this.e2eService.generateE2EPayload(plainConfig, pin)
    this.cachedDEK = dek
    this.cachedClientDekEncrypted = payload.clientDekEncrypted
    return {
      configStr: payload.config,
      e2eFields: {
        e2eVersion: payload.e2eVersion,
        clientKekSalt: payload.clientKekSalt,
        clientDekEncrypted: payload.clientDekEncrypted
      }
    }
  }

  private shouldUseE2E (intent: EncryptionIntent): boolean {
    if (intent === EncryptionIntent.FORCE_ENCRYPT) return true
    if (intent === EncryptionIntent.FORCE_PLAIN) return false
    return this.remoteE2EVersion === E2EVersion.V1
  }

  private shouldChangeE2E (intent: EncryptionIntent): boolean {
    const useE2E = this.shouldUseE2E(intent)
    const remoteIsE2E = this.remoteE2EVersion === E2EVersion.V1
    return useE2E !== remoteIsE2E
  }

  private async decryptRemoteConfig (encryptedConfig: string, clientKekSaltBase64: string, clientDekEncrypted: string): Promise<string> {
    const dek = await this.ensureDEK(clientKekSaltBase64, clientDekEncrypted)
    try {
      return this.e2eService.decryptConfig(encryptedConfig, dek)
    } catch (error: unknown) {
      if (error instanceof DecryptionFailedError) {
        throw new CorruptedDataError('Failed to decrypt remote config payload')
      }
      throw error
    }
  }

  private async ensureDEK (clientKekSaltBase64: string, clientDekEncrypted: string): Promise<Buffer> {
    if (this.cachedDEK && this.cachedClientDekEncrypted === clientDekEncrypted) {
      return this.cachedDEK
    }
    const salt = this.e2eService.decodeSalt(clientKekSaltBase64)

    for (let attempt = 0; attempt < MAX_DECRYPT_ATTEMPTS; attempt += 1) {
      const reason = attempt === 0 ? E2EAskPinReason.DECRYPT : E2EAskPinReason.RETRY
      const pin = await this.askPin(reason, attempt)
      try {
        const dek = this.e2eService.unwrapDEK(clientDekEncrypted, pin, salt)
        this.cachedDEK = dek
        this.cachedClientDekEncrypted = clientDekEncrypted
        return dek
      } catch (error: unknown) {
        if (error instanceof DecryptionFailedError) {
          continue
        }
        throw error
      }
    }

    throw new MaxRetryExceededError()
  }

  private async askPin (reason: E2EAskPinReason, retryCount: number): Promise<string> {
    if (!this.onAskPin) {
      throw new MissingHandlerError()
    }
    const pin = await this.onAskPin(reason, retryCount)
    if (pin === null || pin === undefined || pin.length === 0) {
      throw new InvalidPinError()
    }
    return pin
  }
}

export type {
  IDiffNode,
  IE2EPayload,
  ISyncConfigResponse,
  ISyncOptions,
  IApplyResolvedOptions
} from './types'
export {
  SyncStatus,
  ConflictType,
  E2EVersion,
  EncryptionIntent,
  E2EAskPinReason
} from './types'
export {
  CorruptedDataError,
  UnsupportedVersionError,
  MissingHandlerError,
  InvalidPinError,
  MaxRetryExceededError,
  DecryptionFailedError
} from './errors'
