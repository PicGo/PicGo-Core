import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PicGo } from '../../core/PicGo'
import type { IPicGo } from '../../types'

vi.mock('../../utils/getClipboardImage', () => ({
  default: vi.fn()
}))

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const FILE_NAME = 'integration-upload.png'

const findDefaultWslHome = (): string | undefined => {
  if (process.platform !== 'win32') return undefined

  try {
    const output = execFileSync('wsl.exe', ['--exec', 'sh', '-c', 'wslpath -w "$HOME"'], { encoding: 'utf8' })
    const wslHome = output.replaceAll('\0', '').trim()
    return /^\\\\wsl(?:\$|\.localhost)\\/i.test(wslHome) ? wslHome : undefined
  } catch {
    return undefined
  }
}

const defaultWslHome = findDefaultWslHome()

describe.skipIf(defaultWslHome === undefined)('WSL network-share path upload integration', () => {
  let configDir = ''
  let uncDirPath = ''
  let relativeWslPath = ''
  const received: Array<{ fileName?: string, filePath?: string, buffer?: Buffer }> = []

  beforeAll(() => {
    if (defaultWslHome === undefined) return

    configDir = mkdtempSync(path.join(tmpdir(), 'picgo-wsl-integration-'))
    const relativeDir = `picgo-core-integration-${process.pid}`
    uncDirPath = path.win32.join(defaultWslHome, relativeDir)
    const uncFilePath = path.win32.join(uncDirPath, FILE_NAME)
    relativeWslPath = uncFilePath.replace(/^\\\\/, '')

    mkdirSync(uncDirPath, { recursive: true })
    writeFileSync(uncFilePath, PNG_BYTES)
    expect(existsSync(uncFilePath)).toBe(true)
    expect(existsSync(relativeWslPath)).toBe(false)
    expect(relativeWslPath).toMatch(/^wsl(?:\$|\.localhost)\\/i)
  }, 60000)

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    if (uncDirPath !== '') rmSync(uncDirPath, { recursive: true, force: true })
    if (configDir !== '') rmSync(configDir, { recursive: true, force: true })
  }, 60000)

  it('uploads a raw Typora-style WSL path through PicGo Core', async () => {
    const picgo = new PicGo(path.join(configDir, 'config.json'))
    picgo.saveConfig({ 'picBed.uploader': 'stub', debug: false })
    picgo.helper.uploader.register('stub', {
      name: 'Stub',
      handle: async (ctx: IPicGo) => {
        for (const item of ctx.output) {
          item.imgUrl = `https://integration.example/${item.fileName ?? FILE_NAME}`
          received.push({ fileName: item.fileName, filePath: item.filePath, buffer: item.buffer })
        }
      }
    })

    const result = await picgo.upload([relativeWslPath])

    expect(received).toHaveLength(1)
    expect(received[0].fileName).toBe(FILE_NAME)
    expect(received[0].filePath).toMatch(/^\\\\wsl(?:\$|\.localhost)\\/i)
    expect(received[0].buffer?.equals(PNG_BYTES)).toBe(true)
    expect(result).toEqual([
      expect.objectContaining({
        origin: relativeWslPath,
        imgUrl: `https://integration.example/${FILE_NAME}`
      })
    ])
  }, 60000)
})
