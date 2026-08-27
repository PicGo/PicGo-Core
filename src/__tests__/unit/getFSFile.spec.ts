import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFSFile } from '../../utils/common'

const mocks = vi.hoisted(() => ({
  normalizeWslPath: vi.fn()
}))

vi.mock('../../utils/normalizeWslPath', () => ({
  normalizeWslPath: mocks.normalizeWslPath
}))

describe.skipIf(process.platform !== 'win32')('utils/getFSFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['wsl$', 'wsl.localhost'])(
    'normalizes the %s path before reading while preserving file metadata',
    async (prefix) => {
      const inputPath = `${prefix}\\TestDistro\\home\\user\\image.png`
      const normalizedPath = `\\\\${inputPath}`
      const buffer = Buffer.from('image')
      mocks.normalizeWslPath.mockReturnValue(normalizedPath)
      const readFileMock = vi.spyOn(fs, 'readFile').mockResolvedValue(buffer)

      await expect(getFSFile(inputPath)).resolves.toEqual({
        extname: '.png',
        fileName: 'image.png',
        filePath: normalizedPath,
        buffer,
        success: true
      })
      expect(mocks.normalizeWslPath).toHaveBeenCalledWith(inputPath)
      expect(readFileMock).toHaveBeenCalledWith(normalizedPath)
    }
  )
})
