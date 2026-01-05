import { describe, it, expect } from 'vitest'
import { ConfigMerger } from '../../lib/ConfigSyncManager/Merger'
import { parse } from 'comment-json'
import { ConflictType } from '../../lib/ConfigSyncManager'
import type { IConfig } from '../../types'

const createSnapshotConfig = (): IConfig => ({
  picBed: {
    current: 'smms',
    uploader: 'smms',
    smms: { token: 'token-base' },
    github: { repo: 'base/repo', token: 'token-base' }
  },
  picgoPlugins: { 'picgo-plugin-xxx': true },
  settings: {
    server: { port: 36677, enable: false },
    logLevel: ['info']
  }
} as unknown as IConfig)

describe('ConfigMerger Logic', () => {
  it('should return Local when no changes exist (A/A/A)', () => {
    const snapshot = createSnapshotConfig()
    const res = ConfigMerger.merge3Way(snapshot, snapshot, snapshot)
    expect(res.conflict).toBe(false)
    expect(res.value).toEqual(snapshot)
  })

  it('should accept Local changes (A/B/A) - e.g. updated SMMS token', () => {
    const snapshot = createSnapshotConfig()
    const local = createSnapshotConfig()
    // @ts-ignore
    local.picBed.smms.token = 'token-new-local'
    const res = ConfigMerger.merge3Way(snapshot, local, snapshot)
    expect(res.conflict).toBe(false)
    // @ts-ignore
    expect(res.value.picBed.smms.token).toBe('token-new-local')
  })

  it('should accept Remote changes (A/A/C) - e.g. switched uploader', () => {
    const snapshot = createSnapshotConfig()
    const remote = createSnapshotConfig()
    remote.picBed.current = 'github'
    const res = ConfigMerger.merge3Way(snapshot, snapshot, remote)
    expect(res.conflict).toBe(false)
    // @ts-ignore
    expect(res.value.picBed.current).toBe('github')
  })

  it('should accept Identical changes (A/B/B)', () => {
    const snapshot = createSnapshotConfig()
    const local = createSnapshotConfig()
    // @ts-ignore
    local.settings.server.enable = true
    const remote = createSnapshotConfig()
    // @ts-ignore
    remote.settings.server.enable = true
    const res = ConfigMerger.merge3Way(snapshot, local, remote)
    expect(res.conflict).toBe(false)
    // @ts-ignore
    expect(res.value.settings.server.enable).toBe(true)
  })

  it('should detect Conflict (A/B/C) - Different SMMS tokens', () => {
    const snapshot = createSnapshotConfig()
    const local = createSnapshotConfig()
    // @ts-ignore
    local.picBed.smms.token = 'token-local'
    const remote = createSnapshotConfig()
    // @ts-ignore
    remote.picBed.smms.token = 'token-remote'

    const res = ConfigMerger.merge3Way(snapshot, local, remote)
    expect(res.conflict).toBe(true)

    const picBed = res.diffNode?.children?.find(n => n.key === 'picBed')
    const smms = picBed?.children?.find(n => n.key === 'smms')
    const token = smms?.children?.find(n => n.key === 'token')
    expect(token?.status).toBe(ConflictType.CONFLICT)
  })

  it('should Auto-Merge different sub-keys', () => {
    const snapshot = createSnapshotConfig()
    const local = createSnapshotConfig()
    // @ts-ignore
    local.picBed.smms.token = 'token-local-update'
    const remote = createSnapshotConfig()
    // @ts-ignore
    remote.picBed.github.token = 'token-remote-update'

    const res = ConfigMerger.merge3Way(snapshot, local, remote)
    expect(res.conflict).toBe(false)
    // @ts-ignore
    expect(res.value.picBed.smms.token).toBe('token-local-update')
    // @ts-ignore
    expect(res.value.picBed.github.token).toBe('token-remote-update')
  })

  it('should treat Array changes as conflict', () => {
    const snapshot = createSnapshotConfig()
    const local = createSnapshotConfig()
    // @ts-ignore
    local.settings.logLevel = ['info', 'warn']
    const remote = createSnapshotConfig()
    // @ts-ignore
    remote.settings.logLevel = ['info', 'error']

    const res = ConfigMerger.merge3Way(snapshot, local, remote)
    expect(res.conflict).toBe(true)
  })

  it('should handle comment-json parsed objects', () => {
    const snapshot = parse('{ \"picBed\": { \"current\": \"smms\" } }')
    const local = parse('{ \"picBed\": { \"current\": \"github\" } }')
    const remote = parse('{ \"picBed\": { \"current\": \"smms\" } }')

    const res = ConfigMerger.merge3Way(snapshot, local, remote)
    expect(res.conflict).toBe(false)
    // @ts-ignore
    expect(res.value.picBed.current).toBe('github')
  })
})
