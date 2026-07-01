import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { IPicGo, MultipartCompletedPart, MultipartSession } from '../../../../types'
import { PICGO_CLOUD_MULTIPART_PENDING_FILE } from '../../../../utils/static'

/** 7-day TTL, aligned with R2's multipart lifecycle — the server cleans orphan sessions after 7 days, so keeping local entries longer adds no value. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

const STORE_VERSION = 1

interface StoreFile {
  v: 1
  sessions: Record<string, MultipartSession>
}

const isStoreFile = (value: unknown): value is StoreFile => {
  if (typeof value !== 'object' || value === null) return false
  const v = (value as { v?: unknown }).v
  const sessions = (value as { sessions?: unknown }).sessions
  return v === STORE_VERSION && typeof sessions === 'object' && sessions !== null
}

const makeKey = (userId: string, fingerprint: string): string => `${userId}:${fingerprint}`

const parseKey = (key: string): { userId: string; fingerprint: string } | null => {
  const idx = key.indexOf(':')
  if (idx === -1) return null
  return { userId: key.slice(0, idx), fingerprint: key.slice(idx + 1) }
}

/**
 * Persistent storage for in-flight multipart upload sessions — used to support resume
 * across process crashes / restarts.
 *
 * Layout: a single JSON file `picgo-cloud-multipart-pending.json` under ctx.baseDir.
 * The top level carries a `v: 1` schema version for future migrations. Sessions are keyed
 * by `${userId}:${fingerprint}` so accounts switched on the same machine cannot collide.
 *
 * Design principle: missing file / corrupt JSON / write failure → silently degrade to
 * "no resume". Persistence is nice-to-have, never a hard requirement; storage failures
 * must never block the actual upload flow.
 */
export class MultipartStorage {
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.ctx = ctx
  }

  /** Look up a session by (userId, fingerprint). Returns null if missing / expired / unreadable. */
  get (userId: string, fingerprint: string): MultipartSession | null {
    const store = this.read()
    return store.sessions[makeKey(userId, fingerprint)] ?? null
  }

  /** Write or replace a session. Write failures are swallowed (resume is not a hard requirement). */
  set (userId: string, fingerprint: string, session: MultipartSession): void {
    const store = this.read()
    store.sessions[makeKey(userId, fingerprint)] = session
    this.write(store)
  }

  /** Remove a session by (userId, fingerprint). No-op if the entry doesn't exist. */
  remove (userId: string, fingerprint: string): void {
    const store = this.read()
    const key = makeKey(userId, fingerprint)
    if (!(key in store.sessions)) return
    delete store.sessions[key]
    this.write(store)
  }

  /** Append a completed part; if the same partNumber already exists it is replaced (retry case). */
  appendCompletedPart (userId: string, fingerprint: string, part: MultipartCompletedPart): void {
    const store = this.read()
    const key = makeKey(userId, fingerprint)
    const session = store.sessions[key]
    if (!session) return
    const completedParts = [
      ...session.completedParts.filter(p => p.partNumber !== part.partNumber),
      part
    ]
    store.sessions[key] = { ...session, completedParts }
    this.write(store)
  }

  /** Sweep sessions whose createdAt is older than (now - 7d). Boundary: entries at exactly 7d are kept. */
  sweepExpired (now: number = Date.now()): void {
    const store = this.read()
    let mutated = false
    for (const [key, session] of Object.entries(store.sessions)) {
      if (now - session.createdAt > TTL_MS) {
        delete store.sessions[key]
        mutated = true
      }
    }
    if (mutated) this.write(store)
  }

  /** List every session for the given userId in insertion order. */
  listForUser (userId: string): Array<{ fingerprint: string; session: MultipartSession }> {
    const store = this.read()
    const prefix = `${userId}:`
    const results: Array<{ fingerprint: string; session: MultipartSession }> = []
    for (const [key, session] of Object.entries(store.sessions)) {
      if (!key.startsWith(prefix)) continue
      const parsed = parseKey(key)
      if (!parsed) continue
      results.push({ fingerprint: parsed.fingerprint, session })
    }
    return results
  }

  private getFilePath (): string {
    return path.join(this.ctx.baseDir, PICGO_CLOUD_MULTIPART_PENDING_FILE)
  }

  /** Read the file; missing / parse failure / schema mismatch all collapse to an empty store. */
  private read (): StoreFile {
    const filePath = this.getFilePath()
    if (!existsSync(filePath)) return { v: STORE_VERSION, sessions: {} }
    try {
      const raw = readFileSync(filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isStoreFile(parsed)) return { v: STORE_VERSION, sessions: {} }
      return parsed
    } catch {
      return { v: STORE_VERSION, sessions: {} }
    }
  }

  /** Atomic write; failures swallowed (resume is not a hard requirement and must not block uploads). */
  private write (store: StoreFile): void {
    const filePath = this.getFilePath()
    try {
      writeFileAtomic.sync(filePath, JSON.stringify(store, null, 2) + '\n')
    } catch {
      // Tolerate write failure: only the current set/remove/sweep is lost; next call will retry.
    }
  }
}
