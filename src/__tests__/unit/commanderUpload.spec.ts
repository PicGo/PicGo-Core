import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveUploadInput } from '../../plugins/commander/upload'

describe.skipIf(process.platform !== 'win32')('commander upload input handling', () => {
  it.each(['wsl$', 'wsl.localhost'])('normalizes %s paths before resolving them', (prefix) => {
    const inputPath = `${prefix}\\TestDistro\\home\\user\\image.png`
    const normalizedPath = `\\\\${inputPath}`

    expect(resolveUploadInput(inputPath)).toBe(path.resolve(normalizedPath))
    expect(resolveUploadInput(inputPath)).not.toBe(path.resolve(inputPath))
  })
})
