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

// Represents any node in the config tree (Object, Array, or Primitive)
export type ConfigValue = string | number | boolean | null | undefined | any[] | Record<string, any>

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
