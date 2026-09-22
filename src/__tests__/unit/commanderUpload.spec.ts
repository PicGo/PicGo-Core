import { EventEmitter } from 'node:events'
import path from 'node:path'
import { Command } from 'commander'
import { describe, expect, it, vi } from 'vitest'
import type { IPicGo } from '../../types'
import { OutputFormat } from '../../types'
import { resolveUploadInput, upload } from '../../plugins/commander/upload'

vi.mock('ora', () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    isSpinning: false,
    text: ''
  }
  return { default: () => spinner }
})

interface UploadCommandHarness {
  ctx: IPicGo
  program: Command
  uploadMock: ReturnType<typeof vi.fn<IPicGo['upload']>>
  saveConfig: ReturnType<typeof vi.fn>
  setConfig: ReturnType<typeof vi.fn>
}

const createUploadCommandHarness = (): UploadCommandHarness => {
  const program = new Command()
    .name('picgo')
    .exitOverride()
  const uploadMock = vi.fn<IPicGo['upload']>().mockResolvedValue([])
  const saveConfig = vi.fn()
  const setConfig = vi.fn()
  const ctx = Object.assign(new EventEmitter(), {
    cmd: {
      program,
      inquirer: {}
    },
    upload: uploadMock,
    saveConfig,
    setConfig,
    log: {
      error: vi.fn(),
      warn: vi.fn()
    },
    i18n: {
      translate: vi.fn((key: string) => key)
    }
  }) as unknown as IPicGo

  upload.handle(ctx)
  return { ctx, program, uploadMock, saveConfig, setConfig }
}

describe('commander upload options', () => {
  it('forwards uploader, config ID, and an equals-style Unicode config name for an input URL', async () => {
    const { program, uploadMock, saveConfig, setConfig } = createUploadCommandHarness()
    const input = 'https://example.com/image.png'

    await program.parseAsync([
      'node',
      'picgo',
      'upload',
      '--uploader',
      's3',
      '--configName=配置一',
      '--configId',
      'stable-id',
      input
    ])

    expect(uploadMock).toHaveBeenCalledWith([input], {
      outputFormat: OutputFormat.PRETTY,
      uploader: 's3',
      configName: '配置一',
      configId: 'stable-id'
    })
    expect(saveConfig).not.toHaveBeenCalled()
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('accepts a space-separated config name for clipboard upload', async () => {
    const { program, uploadMock } = createUploadCommandHarness()

    await program.parseAsync(['node', 'picgo', 'upload', '--configName', '配置 二'])

    expect(uploadMock).toHaveBeenCalledWith([], {
      outputFormat: OutputFormat.PRETTY,
      uploader: undefined,
      configName: '配置 二',
      configId: undefined
    })
  })

  it('keeps the u alias and JSON output format behavior', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    const input = 'https://example.com/alias.png'

    await program.parseAsync(['node', 'picgo', 'u', '--format', 'json', input])

    expect(uploadMock).toHaveBeenCalledWith([input], {
      outputFormat: OutputFormat.JSON,
      uploader: undefined,
      configName: undefined,
      configId: undefined
    })
  })

  it('preserves uploads without selector options', async () => {
    const { program, uploadMock, saveConfig, setConfig } = createUploadCommandHarness()
    const input = 'https://example.com/legacy.png'

    await program.parseAsync(['node', 'picgo', 'upload', input])

    expect(uploadMock).toHaveBeenCalledWith([input], {
      outputFormat: OutputFormat.PRETTY,
      uploader: undefined,
      configName: undefined,
      configId: undefined
    })
    expect(saveConfig).not.toHaveBeenCalled()
    expect(setConfig).not.toHaveBeenCalled()
  })
})

describe.skipIf(process.platform !== 'win32')('commander upload input handling', () => {
  it.each(['wsl$', 'wsl.localhost'])('normalizes %s paths before resolving them', (prefix) => {
    const inputPath = `${prefix}\\TestDistro\\home\\user\\image.png`
    const normalizedPath = `\\\\${inputPath}`

    expect(resolveUploadInput(inputPath)).toBe(path.resolve(normalizedPath))
    expect(resolveUploadInput(inputPath)).not.toBe(path.resolve(inputPath))
  })
})
