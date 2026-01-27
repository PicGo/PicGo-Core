import { isEqual, isPlainObject } from 'lodash'
import { ConflictType } from './types'
import type { ConfigValue, IDiffNode, IMergeResult } from './types'

const hasOwn = (obj: unknown, key: string): boolean => {
  if (!obj || typeof obj !== 'object') return false
  return Object.prototype.hasOwnProperty.call(obj, key)
}

const cloneWithCommentSymbols = (source: Record<string, any>): Record<string, any> => {
  const proto = Object.getPrototypeOf(source)
  const cloned = Object.create(proto)

  for (const sym of Object.getOwnPropertySymbols(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, sym)
    if (!desc) continue
    Object.defineProperty(cloned, sym, desc)
  }

  return cloned
}

const mergeObjectTakeRemotePreserveComments = (localObj: Record<string, any>, remoteObj: Record<string, any>): Record<string, any> => {
  const mergedObj: Record<string, any> = cloneWithCommentSymbols(localObj)

  const orderedKeys: string[] = []
  const seen = new Set<string>()
  for (const k of Object.keys(localObj)) {
    if (!seen.has(k)) {
      orderedKeys.push(k)
      seen.add(k)
    }
  }
  for (const k of Object.keys(remoteObj)) {
    if (!seen.has(k)) {
      orderedKeys.push(k)
      seen.add(k)
    }
  }

  for (const k of orderedKeys) {
    if (!hasOwn(remoteObj, k)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete mergedObj[k]
      continue
    }

    const localVal = hasOwn(localObj, k) ? localObj[k] : undefined
    const remoteVal = remoteObj[k]
    if (isPlainObject(localVal) && isPlainObject(remoteVal)) {
      mergedObj[k] = mergeObjectTakeRemotePreserveComments(localVal as Record<string, any>, remoteVal as Record<string, any>)
      continue
    }

    mergedObj[k] = remoteVal
  }

  return mergedObj
}

const deriveStatusFromSnapshotAndFinal = (snapshot: ConfigValue, finalValue: ConfigValue): ConflictType => {
  if (isEqual(snapshot, finalValue)) return ConflictType.CLEAN
  if (snapshot === undefined && finalValue !== undefined) return ConflictType.ADDED
  if (snapshot !== undefined && finalValue === undefined) return ConflictType.DELETED
  return ConflictType.MODIFIED
}

export class ConfigMerger {
  public static merge3Way (snapshot: ConfigValue, local: ConfigValue, remote: ConfigValue, keyName: string = 'root'): IMergeResult {
    // 1. Trivial: Local equals Remote
    if (isEqual(local, remote)) {
      const status = deriveStatusFromSnapshotAndFinal(snapshot, local)
      return {
        value: local,
        conflict: false,
        diffNode: status === ConflictType.CLEAN ? undefined : {
          key: keyName,
          status,
          snapshotValue: snapshot,
          localValue: local,
          remoteValue: remote
        }
      }
    }

    const localIsObj = isPlainObject(local)
    const remoteIsObj = isPlainObject(remote)
    const snapshotIsObj = isPlainObject(snapshot)

    // 2. Remote Changed: Snapshot equals Local -> take Remote
    if (isEqual(snapshot, local)) {
      if (localIsObj && remoteIsObj) {
        // preserve local comments where possible, but take remote values
        const mergedObj = mergeObjectTakeRemotePreserveComments(local as Record<string, any>, remote as Record<string, any>)
        const status = deriveStatusFromSnapshotAndFinal(snapshot, mergedObj)
        return {
          value: mergedObj,
          conflict: false,
          diffNode: status === ConflictType.CLEAN ? undefined : {
            key: keyName,
            status,
            snapshotValue: snapshot,
            localValue: local,
            remoteValue: remote
          }
        }
      }

      const status = deriveStatusFromSnapshotAndFinal(snapshot, remote)
      return {
        value: remote,
        conflict: false,
        diffNode: status === ConflictType.CLEAN ? undefined : {
          key: keyName,
          status,
          snapshotValue: snapshot,
          localValue: local,
          remoteValue: remote
        }
      }
    }

    // 3. Local Changed: Snapshot equals Remote -> take Local
    if (isEqual(snapshot, remote)) {
      const status = deriveStatusFromSnapshotAndFinal(snapshot, local)
      return {
        value: local,
        conflict: false,
        diffNode: status === ConflictType.CLEAN ? undefined : {
          key: keyName,
          status,
          snapshotValue: snapshot,
          localValue: local,
          remoteValue: remote
        }
      }
    }

    // 4. Both Changed (Object): Recursively merge keys.
    if (localIsObj && remoteIsObj && (snapshotIsObj || snapshot === undefined || snapshot === null)) {
      const snapshotObj = (snapshotIsObj ? snapshot : {}) as Record<string, any>
      const localObj = local as Record<string, any>
      const remoteObj = remote as Record<string, any>

      const orderedKeys: string[] = []
      const seen = new Set<string>()
      for (const k of Object.keys(localObj)) {
        if (!seen.has(k)) {
          orderedKeys.push(k)
          seen.add(k)
        }
      }
      for (const k of Object.keys(remoteObj)) {
        if (!seen.has(k)) {
          orderedKeys.push(k)
          seen.add(k)
        }
      }
      for (const k of Object.keys(snapshotObj)) {
        if (!seen.has(k)) {
          orderedKeys.push(k)
          seen.add(k)
        }
      }

      const mergedObj: Record<string, any> = cloneWithCommentSymbols(localObj)
      const children: IDiffNode[] = []
      let conflict = false

      for (const k of orderedKeys) {
        const childSnapshot = hasOwn(snapshotObj, k) ? snapshotObj[k] : undefined
        const childLocal = hasOwn(localObj, k) ? localObj[k] : undefined
        const childRemote = hasOwn(remoteObj, k) ? remoteObj[k] : undefined

        const childRes = ConfigMerger.merge3Way(childSnapshot, childLocal, childRemote, k)
        if (childRes.conflict) conflict = true

        if (childRes.value === undefined) {
          // best effort: remove key if it exists
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete mergedObj[k]
        } else {
          mergedObj[k] = childRes.value
        }

        if (childRes.diffNode && childRes.diffNode.status !== ConflictType.CLEAN) {
          children.push(childRes.diffNode)
        }
      }

      const status: ConflictType = conflict ? ConflictType.CONFLICT : deriveStatusFromSnapshotAndFinal(snapshot, mergedObj)
      return {
        value: mergedObj,
        conflict,
        diffNode: status === ConflictType.CLEAN ? undefined : {
          key: keyName,
          status,
          snapshotValue: snapshot,
          localValue: local,
          remoteValue: remote,
          children: children.length ? children : undefined
        }
      }
    }

    // 5. Both Changed (Primitive/Array): Conflict.
    return {
      value: local,
      conflict: true,
      diffNode: {
        key: keyName,
        status: ConflictType.CONFLICT,
        snapshotValue: snapshot,
        localValue: local,
        remoteValue: remote
      }
    }
  }
}
