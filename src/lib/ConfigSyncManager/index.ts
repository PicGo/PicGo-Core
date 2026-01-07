import fs from 'fs-extra'
import path from 'path'
import { parse, stringify } from 'comment-json'
import { cloneDeep, get, isEqual, isPlainObject, set, unset } from 'lodash'
import type { IPicGo, IConfig } from '../../types'
import { ConfigService } from '../Cloud/services/ConfigService'
import { ConfigMerger } from './Merger'
import { E2ECryptoService } from './E2ECryptoService'
import type {
  ConfigValue,
  IApplyResolvedOptions,
  IE2ERequestFields,
  ISnapshot,
  ISyncConfigResponse,
  ISyncOptions,
  ISyncResult
} from './types'
import { E2EAskPinReason, E2EVersion, EncryptionIntent, SyncStatus } from './types'
import {
  CorruptedDataError,
  DecryptionFailedError,
  InvalidPinError,
  MaxRetryExceededError,
  MissingHandlerError,
  UnsupportedVersionError
} from './errors'

const IGNORED_CONFIG_PATHS = ['settings.picgoCloud.token']
const MAX_DECRYPT_ATTEMPTS = 4

interface ISnapshotLike {
  version: number
  updatedAt?: string
  data: ConfigValue
}

interface IConfigSyncManagerOptions {
  onAskPin?: (reason: E2EAskPinReason, retryCount: number) => Promise<string | null>
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
  private readonly onAskPin?: (reason: E2EAskPinReason, retryCount: number) => Promise<string | null>
  private readonly e2eService: E2ECryptoService
  private currentRemoteVersion: number = 0
  private originalRemote: IConfig | null = null
  private remoteE2EVersion: E2EVersion = E2EVersion.NONE
  private remoteSalt?: string
  private remoteEncryptedDEK?: string
  private cachedDEK?: Buffer
  private cachedEncryptedDEK?: string

  constructor (ctx: IPicGo, options: IConfigSyncManagerOptions = {}) {
    this.ctx = ctx
    this.snapshotPath = path.join(ctx.baseDir, 'config.snapshot.json')
    this.configService = new ConfigService(ctx)
    this.onAskPin = options.onAskPin
    this.e2eService = new E2ECryptoService()
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

  async sync (options: ISyncOptions = {}, retryCount: number = 0): Promise<ISyncResult> {
    try {
      const encryptionIntent = options.encryptionIntent ?? EncryptionIntent.AUTO
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
          const payload = await this.buildPushPayload(localConfig as IConfig, encryptionIntent)
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
        await this.writeConfigWithComments(this.ctx.configPath, mergedConfig)
      }

      // Step D: Prepare Push (restore remote ignored fields)
      const configToPush = this.maskIgnoredFields(mergedConfig, this.originalRemote)
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

  async applyResolvedConfig (resolvedConfig: IConfig, options: IApplyResolvedOptions = {}): Promise<ISyncResult> {
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

      const useE2E = options.useE2E ?? (this.remoteE2EVersion === E2EVersion.V1)
      const encryptionIntent = useE2E ? EncryptionIntent.FORCE_ENCRYPT : EncryptionIntent.FORCE_PLAIN

      // 4) Push to cloud
      const payload = await this.buildPushPayload(configToPush, encryptionIntent)
      await this.pushRemoteConfig(payload.configStr, payload.e2eFields)

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
    this.ctx.log.info('Fetching remote config for sync...')
    const res = await this.configService.fetchConfig()
    if (!res) {
      this.currentRemoteVersion = 0
      this.setRemoteE2EState(E2EVersion.NONE)
      return null
    }
    this.currentRemoteVersion = res.version
    const e2eVersion = this.resolveE2EVersion(res.e2eVersion)

    if (e2eVersion === E2EVersion.V1) {
      const salt = this.requireSalt(res)
      const encryptedDEK = this.requireEncryptedDEK(res)
      this.setRemoteE2EState(E2EVersion.V1, salt, encryptedDEK)
      const decryptedConfig = await this.decryptRemoteConfig(res.config, salt, encryptedDEK)
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
    if (e2eFields.e2eVersion === E2EVersion.V1 && e2eFields.salt && e2eFields.encryptedDEK) {
      this.setRemoteE2EState(E2EVersion.V1, e2eFields.salt, e2eFields.encryptedDEK)
      return
    }
    if (e2eFields.e2eVersion === E2EVersion.NONE) {
      this.setRemoteE2EState(E2EVersion.NONE)
    }
  }

  private setRemoteE2EState (version: E2EVersion, salt?: string, encryptedDEK?: string): void {
    this.remoteE2EVersion = version
    this.remoteSalt = salt
    this.remoteEncryptedDEK = encryptedDEK
    if (!encryptedDEK || encryptedDEK !== this.cachedEncryptedDEK) {
      this.cachedDEK = undefined
      this.cachedEncryptedDEK = undefined
    }
  }

  private resolveE2EVersion (version?: number): E2EVersion {
    if (version === E2EVersion.V1) return E2EVersion.V1
    if (version === E2EVersion.NONE || version === undefined) return E2EVersion.NONE
    if (typeof version === 'number') {
      throw new UnsupportedVersionError(`Unsupported E2E version: ${version}`)
    }
    return E2EVersion.NONE
  }

  private requireSalt (res: ISyncConfigResponse): string {
    if (!res.salt) {
      throw new CorruptedDataError('Missing salt for encrypted config')
    }
    return res.salt
  }

  private requireEncryptedDEK (res: ISyncConfigResponse): string {
    if (!res.encryptedDEK) {
      throw new CorruptedDataError('Missing encryptedDEK for encrypted config')
    }
    return res.encryptedDEK
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

    if (this.remoteE2EVersion === E2EVersion.V1 && this.remoteSalt && this.remoteEncryptedDEK) {
      const dek = await this.ensureDEK(this.remoteSalt, this.remoteEncryptedDEK)
      return {
        configStr: this.e2eService.encryptConfig(plainConfig, dek),
        e2eFields: {
          e2eVersion: E2EVersion.V1,
          salt: this.remoteSalt,
          encryptedDEK: this.remoteEncryptedDEK
        }
      }
    }

    const pin = await this.askPin(E2EAskPinReason.SETUP, 0)
    const { payload, dek } = this.e2eService.generateE2EPayload(plainConfig, pin)
    this.cachedDEK = dek
    this.cachedEncryptedDEK = payload.encryptedDEK
    return {
      configStr: payload.config,
      e2eFields: {
        e2eVersion: payload.e2eVersion,
        salt: payload.salt,
        encryptedDEK: payload.encryptedDEK
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

  private async decryptRemoteConfig (encryptedConfig: string, saltBase64: string, encryptedDEK: string): Promise<string> {
    const dek = await this.ensureDEK(saltBase64, encryptedDEK)
    try {
      return this.e2eService.decryptConfig(encryptedConfig, dek)
    } catch (error: unknown) {
      if (error instanceof DecryptionFailedError) {
        throw new CorruptedDataError('Failed to decrypt remote config payload')
      }
      throw error
    }
  }

  private async ensureDEK (saltBase64: string, encryptedDEK: string): Promise<Buffer> {
    if (this.cachedDEK && this.cachedEncryptedDEK === encryptedDEK) {
      return this.cachedDEK
    }
    const salt = this.e2eService.decodeSalt(saltBase64)

    for (let attempt = 0; attempt < MAX_DECRYPT_ATTEMPTS; attempt += 1) {
      const reason = attempt === 0 ? E2EAskPinReason.DECRYPT : E2EAskPinReason.RETRY
      const pin = await this.askPin(reason, attempt)
      try {
        const dek = this.e2eService.unwrapDEK(encryptedDEK, pin, salt)
        this.cachedDEK = dek
        this.cachedEncryptedDEK = encryptedDEK
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
