import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IImgInfo, ILogger, IPicGo } from '../../types'
import { LogConsoleStream, OutputFormat } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
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
  originalLog: ILogger
  stderrLog: ILogger
  createLogger: ReturnType<typeof vi.fn>
}

const createMockLogger = (): ILogger => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

const createUploadCommandHarness = (): UploadCommandHarness => {
  const program = new Command()
    .name('picgo')
    .exitOverride()
  const uploadMock = vi.fn<IPicGo['upload']>().mockResolvedValue([])
  const saveConfig = vi.fn()
  const setConfig = vi.fn()
  const stderrLog = createMockLogger()
  const createLogger = vi.fn(() => stderrLog)
  const originalLog: ILogger = { ...createMockLogger(), createLogger }
  const ctx = Object.assign(new EventEmitter(), {
    cmd: {
      program,
      inquirer: {}
    },
    upload: uploadMock,
    saveConfig,
    setConfig,
    log: originalLog,
    i18n: {
      translate: vi.fn((key: string, args?: Record<string, string>) => (args ? `${key} ${JSON.stringify(args)}` : key))
    }
  }) as unknown as IPicGo

  upload.handle(ctx)
  return { ctx, program, uploadMock, saveConfig, setConfig, originalLog, stderrLog, createLogger }
}

const successItem = (name: string): IImgInfo => ({
  imgUrl: `https://cdn.example.com/${name}`,
  origin: `/tmp/${name}`,
  fileName: name,
  type: 'github',
  contentType: 'image/png',
  size: 3,
  width: 1,
  height: 1,
  extname: '.png',
  buffer: Buffer.from('abc'),
  base64Image: 'YWJj'
})

let consoleLogSpy: ReturnType<typeof vi.spyOn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.exitCode = undefined
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  process.exitCode = undefined
  consoleLogSpy.mockRestore()
  consoleErrorSpy.mockRestore()
})

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

describe('commander upload input validation', () => {
  let tmpDir: string
  let existingFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picgo-upload-cmd-'))
    existingFile = path.join(tmpDir, 'exists.png')
    fs.writeFileSync(existingFile, 'abc')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does not call ctx.upload (so never reads the clipboard) when every explicit path is missing', async () => {
    const { program, uploadMock, originalLog } = createUploadCommandHarness()

    await program.parseAsync(['node', 'picgo', 'upload', path.join(tmpDir, 'missing-a.png'), path.join(tmpDir, 'missing-b.png')])

    expect(uploadMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(originalLog.warn).toHaveBeenCalledTimes(2)
    expect(originalLog.error).toHaveBeenCalledWith('CLI_UPLOAD_NO_VALID_INPUT')
  })

  it('in json mode with every path missing: stdout stays empty and the reason goes to stderr', async () => {
    const { program, uploadMock } = createUploadCommandHarness()

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', path.join(tmpDir, 'missing.png')])

    expect(uploadMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith('CLI_UPLOAD_NO_VALID_INPUT')
  })

  it('uploads the remaining paths when some are missing, but exits with 1', async () => {
    const { program, uploadMock, originalLog } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([successItem('exists.png')])
    const missing = path.join(tmpDir, 'missing.png')

    await program.parseAsync(['node', 'picgo', 'upload', existingFile, missing])

    expect(uploadMock).toHaveBeenCalledWith([existingFile], expect.objectContaining({ outputFormat: OutputFormat.PRETTY }))
    expect(originalLog.warn).toHaveBeenCalledWith(expect.stringContaining('CLI_UPLOAD_INPUT_NOT_EXIST'))
    expect(process.exitCode).toBe(1)
  })

  it('still uploads the clipboard when no input is given', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([successItem('clipboard.png')])

    await program.parseAsync(['node', 'picgo', 'upload'])

    expect(uploadMock).toHaveBeenCalledWith([], expect.objectContaining({ outputFormat: OutputFormat.PRETTY }))
    expect(process.exitCode).toBeUndefined()
  })
})

describe('commander upload result and exit code', () => {
  const input = 'https://example.com/a.png'

  it('pretty mode: success keeps exit code 0 and prints nothing extra to stdout', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([successItem('a.png')])

    await program.parseAsync(['node', 'picgo', 'upload', input])

    expect(process.exitCode).toBeUndefined()
    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('pretty mode: an empty result or a result item without imgUrl exits with 1', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([])
    await program.parseAsync(['node', 'picgo', 'upload', input])
    expect(process.exitCode).toBe(1)

    process.exitCode = undefined
    const second = createUploadCommandHarness()
    second.uploadMock.mockResolvedValue([successItem('a.png'), { fileName: 'b.png' }])
    await second.program.parseAsync(['node', 'picgo', 'upload', input, 'https://example.com/b.png'])
    expect(process.exitCode).toBe(1)
  })

  it('json mode: prints exactly one parsable JSON line on stdout with the documented fields', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([successItem('a.png')])

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', input])

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const line = String(consoleLogSpy.mock.calls[0][0])
    expect(line).not.toContain('\n')
    expect(JSON.parse(line)).toEqual([{
      imgUrl: 'https://cdn.example.com/a.png',
      origin: '/tmp/a.png',
      fileName: 'a.png',
      type: 'github',
      contentType: 'image/png',
      size: 3,
      width: 1,
      height: 1,
      extname: '.png'
    }])
    expect(process.exitCode).toBeUndefined()
  })

  it('json mode: swaps ctx.log for a stderr logger during the upload and restores it afterwards', async () => {
    const { ctx, program, uploadMock, originalLog, stderrLog, createLogger } = createUploadCommandHarness()
    let logDuringUpload: ILogger | undefined
    uploadMock.mockImplementation(async () => {
      logDuringUpload = ctx.log
      return [successItem('a.png')]
    })

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', input])

    expect(createLogger).toHaveBeenCalledWith({ consoleStream: LogConsoleStream.STDERR })
    expect(logDuringUpload).toBe(stderrLog)
    expect(ctx.log).toBe(originalLog)
  })

  it('pretty mode: does not swap ctx.log', async () => {
    const { ctx, program, uploadMock, originalLog, createLogger } = createUploadCommandHarness()
    let logDuringUpload: ILogger | undefined
    uploadMock.mockImplementation(async () => {
      logDuringUpload = ctx.log
      return [successItem('a.png')]
    })

    await program.parseAsync(['node', 'picgo', 'upload', input])

    expect(createLogger).not.toHaveBeenCalled()
    expect(logDuringUpload).toBe(originalLog)
  })

  it('json mode: partial failure still prints every item, failed ones without imgUrl, and exits with 1', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([successItem('a.png'), { fileName: 'b.png', origin: '/tmp/b.png' }])

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', input, 'https://example.com/b.png'])

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(String(consoleLogSpy.mock.calls[0][0])) as Array<{ imgUrl?: string, fileName?: string }>
    expect(parsed).toHaveLength(2)
    expect(parsed[0].imgUrl).toBe('https://cdn.example.com/a.png')
    expect(parsed[1].imgUrl).toBeUndefined()
    expect(parsed[1].fileName).toBe('b.png')
    expect(process.exitCode).toBe(1)
  })

  it('json mode: complete failure keeps stdout empty and prints the captured reason on stderr', async () => {
    const { ctx, program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockImplementation(async () => {
      // Lifecycle swallows the error but emits FAILED.
      ctx.emit(IBuildInEvent.FAILED, new Error('token expired\nplease login'))
      return [{ fileName: 'a.png' }]
    })

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', input])

    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('CLI_UPLOAD_FAILED {"reason":"token expired please login"}')
    expect(process.exitCode).toBe(1)
    expect(ctx.listenerCount(IBuildInEvent.FAILED)).toBe(0)
  })

  it('json mode: an empty result without a captured error falls back to a generic reason', async () => {
    const { program, uploadMock } = createUploadCommandHarness()
    uploadMock.mockResolvedValue([])

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', input])

    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith('CLI_UPLOAD_FAILED {"reason":"CLI_UPLOAD_FAILED_NO_RESULT"}')
    expect(process.exitCode).toBe(1)
  })

  it('json mode: a thrown error exits with 1, keeps stdout empty and restores ctx.log', async () => {
    const { ctx, program, uploadMock, originalLog, stderrLog } = createUploadCommandHarness()
    uploadMock.mockRejectedValue(new Error('Uploader "__nope__" is not registered.'))

    await program.parseAsync(['node', 'picgo', 'upload', '--format', 'json', input])

    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith('CLI_UPLOAD_FAILED {"reason":"Uploader \\"__nope__\\" is not registered."}')
    expect(stderrLog.error).toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(ctx.log).toBe(originalLog)
  })

  it('pretty mode: a thrown error exits with 1', async () => {
    const { program, uploadMock, originalLog } = createUploadCommandHarness()
    uploadMock.mockRejectedValue(new Error('boom'))

    await program.parseAsync(['node', 'picgo', 'upload', input])

    expect(originalLog.error).toHaveBeenCalledWith(expect.any(Error))
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
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
