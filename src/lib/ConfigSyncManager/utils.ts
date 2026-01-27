import fs from 'fs-extra'
import { parse, stringify } from 'comment-json'
import { cloneDeep, get, isPlainObject, set, unset } from 'lodash'
import type { IConfig } from '../../types'
import type { ConfigValue, ISnapshot } from './types'
import { E2EVersion, EncryptionMethod } from './types'
import { InvalidEncryptionMethodError, UnsupportedVersionError } from './errors'

const ENCRYPTION_METHOD_PATH = 'settings.picgoCloud.encryptionMethod'

const IGNORED_PATHS = ['settings.picgoCloud.token', ENCRYPTION_METHOD_PATH]

interface IMaskIgnoredOptions {
  cleanupEmptyParents?: boolean
}

/**
 * Remove empty parent objects after unsetting ignored paths to avoid pushing empty shells.
 */
const cleanupEmptyParents = (target: IConfig, pathValue: string): void => {
  const segments = pathValue.split('.')
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const parentPath = segments.slice(0, i).join('.')
    const parentValue = get(target, parentPath)
    if (isPlainObject(parentValue) && Object.keys(parentValue).length === 0) {
      unset(target, parentPath)
      continue
    }
    break
  }
}

/**
 * Mask ignored config paths so local-only values don't conflict or overwrite remote values.
 */
const maskIgnoredFields = (target: IConfig, source: IConfig, options: IMaskIgnoredOptions = {}): IConfig => {
  const result = cloneDeep(target)
  const shouldCleanup = options.cleanupEmptyParents === true

  IGNORED_PATHS.forEach((ignoredPath: string) => {
    const sourceValue = get(source, ignoredPath)
    if (sourceValue !== undefined) {
      set(result, ignoredPath, sourceValue)
    } else {
      unset(result, ignoredPath)
      if (shouldCleanup) {
        cleanupEmptyParents(result, ignoredPath)
      }
    }
  })

  return result
}


/**
 * Read the local encryption method preference from config.
 */
const getLocalEncryptionMethod = (config: IConfig): EncryptionMethod | undefined => {
  const value = get(config, ENCRYPTION_METHOD_PATH)
  if (value === undefined) {
    return undefined
  }
  if (value === EncryptionMethod.AUTO || value === EncryptionMethod.SSE || value === EncryptionMethod.E2EE) {
    return value
  }
  throw new InvalidEncryptionMethodError(value)
}

/**
 * Resolve encryption method based on explicit method or local preference.
 */
const resolveEncryptionMethod = (method: EncryptionMethod | undefined, localConfig: IConfig): EncryptionMethod => {
  if (method) {
    return method
  }
  const preference = getLocalEncryptionMethod(localConfig)
  return preference ?? EncryptionMethod.AUTO
}

/**
 * Normalize remote E2E version and reject unsupported versions.
 */
const resolveE2EVersion = (version?: number): E2EVersion => {
  if (version === E2EVersion.V1) return E2EVersion.V1
  if (version === E2EVersion.NONE || version === undefined) return E2EVersion.NONE
  if (typeof version === 'number') {
    throw new UnsupportedVersionError(`Unsupported E2E version: ${version}`)
  }
  return E2EVersion.NONE
}

/**
 * Read a JSON config file using comment-json to preserve comments and metadata.
 */
const readConfigWithComments = async (filePath: string): Promise<ConfigValue> => {
  if (await fs.pathExists(filePath)) {
    const content = await fs.readFile(filePath, 'utf8')
    return parse(content)
  }
  return {}
}

/**
 * Write a JSON config file using comment-json to preserve comments and metadata.
 */
const writeConfigWithComments = async (filePath: string, config: ConfigValue): Promise<void> => {
  const content = stringify(config, null, 2)
  await fs.writeFile(filePath, content, 'utf8')
}

interface ISnapshotLike {
  version: number
  updatedAt?: string
  data: ConfigValue
}

/**
 * Detect whether a snapshot payload matches the structured snapshot format.
 */
const isSnapshotLike = (value: ConfigValue): value is ISnapshotLike => {
  if (!isPlainObject(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.version === 'number' &&
    Object.prototype.hasOwnProperty.call(record, 'data')
  )
}

/**
 * Load snapshot data from disk, handling legacy plain-object snapshots.
 */
const loadSnapshot = async (snapshotPath: string): Promise<ISnapshot> => {
  if (!(await fs.pathExists(snapshotPath))) {
    return {
      version: 0,
      updatedAt: '',
      data: {}
    }
  }

  const raw = await readConfigWithComments(snapshotPath)
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

/**
 * Persist snapshot data to disk with version and timestamp metadata.
 */
const saveSnapshot = async (snapshotPath: string, config: ConfigValue, version: number): Promise<void> => {
  await writeConfigWithComments(snapshotPath, {
    version,
    updatedAt: new Date().toISOString(),
    data: config
  })
}

export {
  IGNORED_PATHS,
  ENCRYPTION_METHOD_PATH,
  getLocalEncryptionMethod,
  loadSnapshot,
  maskIgnoredFields,
  readConfigWithComments,
  resolveE2EVersion,
  resolveEncryptionMethod,
  saveSnapshot,
  writeConfigWithComments
}
