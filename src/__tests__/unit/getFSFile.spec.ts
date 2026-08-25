import fs from 'fs-extra'
import { describe, expect, it, vi } from 'vitest'
import { getFSFile } from '../../utils/common'

const mocks = vi.hoisted(() => ({
  normalizeWslPath: vi.fn()
}))

vi.mock('../../utils/normalizeWslPath', () => ({
  normalizeWslPath: mocks.normalizeWslPath
}))

describe('utils/getFSFile', () => {
  it('normalizes the path before reading while preserving file metadata', async () => {
    const inputPath = 'wsl$\\Ubuntu\\home\\user\\image.png'
    const normalizedPath = '\\\\wsl$\\Ubuntu\\home\\user\\image.png'
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
  })
})
