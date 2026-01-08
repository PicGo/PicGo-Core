import type { IConfig } from '../../types'

export enum SyncStatus {
  SUCCESS = 'success',
  CONFLICT = 'conflict',
  FAILED = 'failed'
}

export enum ConflictType {
  CLEAN = 'clean',
  CONFLICT = 'conflict',
  ADDED = 'added',
  DELETED = 'deleted',
  MODIFIED = 'modified'
}

export enum E2EVersion {
  NONE = 0,
  V1 = 1
}

export enum EncryptionIntent {
  AUTO = 'auto',
  FORCE_ENCRYPT = 'force_encrypt',
  FORCE_PLAIN = 'force_plain'
}

export enum E2EAskPinReason {
  SETUP = 'setup',
  DECRYPT = 'decrypt',
  RETRY = 'retry'
}

export enum APPType {
  GUI = 'gui',
  CLI = 'cli'
}

// Represents any node in the config tree (Object, Array, or Primitive)
export type ConfigValue = string | number | boolean | null | undefined | any[] | Record<string, any>

export interface IE2EPayload {
  e2eVersion: E2EVersion.V1
  clientKekSalt: string
  clientDekEncrypted: string
  config: string
}

export interface IE2ERequestFields {
  e2eVersion?: E2EVersion
  clientKekSalt?: string
  clientDekEncrypted?: string
}

export interface ISyncConfigResponse {
  version: number
  config: string
  encryption?: {
    e2eVersion?: number
    clientKekSalt?: string
    clientDekEncrypted?: string
  }
}

export interface ISyncOptions {
  encryptionIntent?: EncryptionIntent
}

export interface IApplyResolvedOptions {
  useE2E?: boolean
}

export interface ISnapshot {
  version: number
  updatedAt: string
  data: ConfigValue
}

export interface IDiffNode {
  key: string
  status: ConflictType
  snapshotValue?: ConfigValue
  localValue?: ConfigValue
  remoteValue?: ConfigValue
  children?: IDiffNode[]
}

export interface IMergeResult {
  value: ConfigValue
  conflict: boolean
  diffNode?: IDiffNode
}

export interface ISyncResult {
  status: SyncStatus
  message?: string
  diffTree?: IDiffNode
  mergedConfig?: IConfig
}
