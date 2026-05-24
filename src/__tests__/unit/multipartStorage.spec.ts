import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPicGo, MultipartSession } from '../../types'
import { MultipartStorage } from '../../lib/Cloud/services/multipart/MultipartStorage'
import { PICGO_CLOUD_MULTIPART_PENDING_FILE } from '../../utils/static'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => {
    await rm(dir, { recursive: true, force: true })
  }))
})

const createCtx = async (): Promise<{ ctx: IPicGo; baseDir: string }> => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'picgo-multipart-store-'))
  tempDirs.push(baseDir)
  const ctx = {
    baseDir,
    log: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn()
    }
  } as unknown as IPicGo
  return { ctx, baseDir }
}

const makeSession = (overrides: Partial<MultipartSession> = {}): MultipartSession => ({
  v: 1,
  uploadId: 'upload-1',
  objectKey: 'user-1/key.bin',
  publicId: 'pub-1',
  url: 'https://example.com/key.bin',
  filename: 'demo.mp4',
  size: 100 * 1024 * 1024,
  contentType: 'video/mp4',
  partSize: 8 * 1024 * 1024,
  partCount: 13,
  completedParts: [],
  createdAt: Date.now(),
  ...overrides
})

const readStoreFile = async (baseDir: string): Promise<unknown> => {
  const filePath = path.join(baseDir, PICGO_CLOUD_MULTIPART_PENDING_FILE)
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

describe('MultipartStorage', () => {
  describe('get / set / remove', () => {
    it('returns null when no entry exists', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      expect(store.get('user-1', 'fp-1')).toBeNull()
    })

    it('round-trips a session through set → get', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      const session = makeSession({ uploadId: 'upload-abc' })
      store.set('user-1', 'fp-1', session)
      expect(store.get('user-1', 'fp-1')).toEqual(session)
    })

    it('isolates sessions across (userId, fingerprint) keys', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-A', makeSession({ uploadId: 'upload-A' }))
      store.set('user-2', 'fp-A', makeSession({ uploadId: 'upload-B' }))
      store.set('user-1', 'fp-B', makeSession({ uploadId: 'upload-C' }))
      expect(store.get('user-1', 'fp-A')?.uploadId).toBe('upload-A')
      expect(store.get('user-2', 'fp-A')?.uploadId).toBe('upload-B')
      expect(store.get('user-1', 'fp-B')?.uploadId).toBe('upload-C')
    })

    it('remove drops the entry; subsequent get returns null', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-1', makeSession())
      store.remove('user-1', 'fp-1')
      expect(store.get('user-1', 'fp-1')).toBeNull()
    })

    it('remove on absent entry is a no-op', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      expect(() => store.remove('user-1', 'fp-missing')).not.toThrow()
    })
  })

  describe('appendCompletedPart', () => {
    it('appends a new part to an existing session', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-1', makeSession())
      store.appendCompletedPart('user-1', 'fp-1', { partNumber: 1, etag: 'etag-1' })
      store.appendCompletedPart('user-1', 'fp-1', { partNumber: 2, etag: 'etag-2' })
      const session = store.get('user-1', 'fp-1')
      expect(session?.completedParts).toEqual([
        { partNumber: 1, etag: 'etag-1' },
        { partNumber: 2, etag: 'etag-2' }
      ])
    })

    it('replaces the entry when same partNumber re-appends (retry case)', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-1', makeSession())
      store.appendCompletedPart('user-1', 'fp-1', { partNumber: 1, etag: 'etag-old' })
      store.appendCompletedPart('user-1', 'fp-1', { partNumber: 1, etag: 'etag-new' })
      const session = store.get('user-1', 'fp-1')
      expect(session?.completedParts).toEqual([
        { partNumber: 1, etag: 'etag-new' }
      ])
    })

    it('is a no-op when no session exists', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      expect(() => store.appendCompletedPart('user-1', 'fp-missing', { partNumber: 1, etag: 'x' })).not.toThrow()
    })
  })

  describe('sweepExpired', () => {
    it('removes entries older than 7 days', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      const now = Date.now()
      const sevenDaysAndOne = now - (7 * 24 * 60 * 60 * 1000 + 1)
      store.set('user-1', 'fp-old', makeSession({ createdAt: sevenDaysAndOne }))
      store.set('user-1', 'fp-fresh', makeSession({ createdAt: now }))
      store.sweepExpired(now)
      expect(store.get('user-1', 'fp-old')).toBeNull()
      expect(store.get('user-1', 'fp-fresh')).not.toBeNull()
    })

    it('keeps entries exactly at the 7-day boundary', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      const now = Date.now()
      const exactly7d = now - 7 * 24 * 60 * 60 * 1000
      store.set('user-1', 'fp-edge', makeSession({ createdAt: exactly7d }))
      store.sweepExpired(now)
      expect(store.get('user-1', 'fp-edge')).not.toBeNull()
    })

    it('handles missing file silently', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      expect(() => store.sweepExpired()).not.toThrow()
    })
  })

  describe('listForUser', () => {
    it('returns only entries for the given userId', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-A', makeSession({ uploadId: 'upload-A' }))
      store.set('user-1', 'fp-B', makeSession({ uploadId: 'upload-B' }))
      store.set('user-2', 'fp-A', makeSession({ uploadId: 'upload-X' }))
      const results = store.listForUser('user-1')
      const ids = results.map(r => r.session.uploadId).sort()
      expect(ids).toEqual(['upload-A', 'upload-B'])
    })

    it('returns empty array when user has no entries', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      expect(store.listForUser('user-none')).toEqual([])
    })
  })

  describe('persistence to disk', () => {
    it('writes a versioned schema to picgo-cloud-multipart-pending.json', async () => {
      const { ctx, baseDir } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-1', makeSession({ uploadId: 'upload-disk' }))
      const file = await readStoreFile(baseDir)
      expect(file).toMatchObject({
        v: 1,
        sessions: {
          'user-1:fp-1': expect.objectContaining({ uploadId: 'upload-disk' })
        }
      })
    })

    it('uses atomic write (no temp file lingering after success)', async () => {
      const { ctx, baseDir } = await createCtx()
      const store = new MultipartStorage(ctx)
      store.set('user-1', 'fp-1', makeSession())
      const entries = await import('node:fs').then(fs => fs.promises.readdir(baseDir))
      // write-file-atomic uses .<name>.<pid>... pattern but cleans up; only the target should remain
      expect(entries.filter(e => e.startsWith('.'))).toEqual([])
      expect(entries).toContain(PICGO_CLOUD_MULTIPART_PENDING_FILE)
    })
  })

  describe('corruption tolerance', () => {
    it('treats a non-JSON file as empty', async () => {
      const { ctx, baseDir } = await createCtx()
      await writeFile(path.join(baseDir, PICGO_CLOUD_MULTIPART_PENDING_FILE), 'not json {{{')
      const store = new MultipartStorage(ctx)
      expect(store.get('user-1', 'fp-1')).toBeNull()
    })

    it('treats wrong schema version as empty', async () => {
      const { ctx, baseDir } = await createCtx()
      await writeFile(
        path.join(baseDir, PICGO_CLOUD_MULTIPART_PENDING_FILE),
        JSON.stringify({ v: 999, sessions: { 'user-1:fp-1': makeSession() } })
      )
      const store = new MultipartStorage(ctx)
      expect(store.get('user-1', 'fp-1')).toBeNull()
    })

    it('does not throw when baseDir is unwritable; set is best-effort', async () => {
      const { ctx } = await createCtx()
      const store = new MultipartStorage(ctx)
      // simulate write failure by pointing to non-existent nested dir
      ;(ctx as { baseDir: string }).baseDir = '/nonexistent/path/that/should/fail'
      expect(() => store.set('user-1', 'fp-1', makeSession())).not.toThrow()
      expect(store.get('user-1', 'fp-1')).toBeNull()
    })
  })
})
