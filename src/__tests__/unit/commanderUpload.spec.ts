import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveUploadInput } from '../../plugins/commander/upload'

const mocks = vi.hoisted(() => ({
  normalizeWslPath: vi.fn()
}))

vi.mock('../../utils/normalizeWslPath', () => ({
  normalizeWslPath: mocks.normalizeWslPath
}))

describe('commander upload input handling', () => {
  it('normalizes WSL paths before resolving them', () => {
    const inputPath = 'wsl$\\Ubuntu\\home\\user\\image.png'
    const normalizedPath = '\\\\wsl$\\Ubuntu\\home\\user\\image.png'
    mocks.normalizeWslPath.mockReturnValue(normalizedPath)

    expect(resolveUploadInput(inputPath)).toBe(path.resolve(normalizedPath))
    expect(mocks.normalizeWslPath).toHaveBeenCalledWith(inputPath)
  })
})
