import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { IPicGo, MultipartCompletedPart, MultipartSession } from '../../../../types'
import { PICGO_CLOUD_MULTIPART_PENDING_FILE } from '../../../../utils/static'

/** 7 天 TTL，与 R2 multipart lifecycle 对齐 —— 服务端 7 天清未完成 session，本地长于此意义不大。 */
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
 * 本地持久化分片上传会话 —— 用于跨进程崩溃后的断点续传。
 *
 * 存储结构：单 JSON 文件 `picgo-cloud-multipart-pending.json`（位于 ctx.baseDir）。
 * 顶层带 `v: 1` 版本号，便于 schema 演进的兼容性处理。session 以 `${userId}:${fingerprint}`
 * 作为 key，避免多账号切换时记录互相污染。
 *
 * 设计原则：文件不存在 / 解析失败 / 写入失败 → 静默降级为"无 resume"。resume 是 nice-to-have，
 * 不是硬要求；持久化失败不应阻塞实际上传流程。
 */
export class MultipartStorage {
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.ctx = ctx
  }

  /** 读取指定 (userId, fingerprint) 的 session；找不到 / 已过期 / 解析失败返回 null */
  get (userId: string, fingerprint: string): MultipartSession | null {
    const store = this.read()
    return store.sessions[makeKey(userId, fingerprint)] ?? null
  }

  /** 写入或覆盖一条 session；写入失败静默吞掉（resume 不是硬要求） */
  set (userId: string, fingerprint: string, session: MultipartSession): void {
    const store = this.read()
    store.sessions[makeKey(userId, fingerprint)] = session
    this.write(store)
  }

  /** 删除指定 (userId, fingerprint) 的 session；entry 不存在是 no-op */
  remove (userId: string, fingerprint: string): void {
    const store = this.read()
    const key = makeKey(userId, fingerprint)
    if (!(key in store.sessions)) return
    delete store.sessions[key]
    this.write(store)
  }

  /** 追加一个已完成的 part；同 partNumber 已存在则替换（覆盖重试场景） */
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

  /** 清除 createdAt 早于 (now - 7d) 的过期 session。边界情况：恰好 7d 整保留。 */
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

  /** 列出指定 userId 下所有 session，按写入顺序返回 */
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

  /** 读取文件；不存在 / 解析失败 / schema 不匹配统一返回空 store */
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

  /** 原子写入；失败静默吞掉（resume 非硬要求，不应中断上传流程） */
  private write (store: StoreFile): void {
    const filePath = this.getFilePath()
    try {
      writeFileAtomic.sync(filePath, JSON.stringify(store, null, 2) + '\n')
    } catch {
      // 写入失败容忍，仅本次 set/remove/sweep 丢失；下次仍会尝试
    }
  }
}
