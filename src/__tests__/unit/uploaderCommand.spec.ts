import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPicGo, IUploaderConfigItem } from '../../types'
import { uploader } from '../../plugins/commander/uploader'

const githubWork: IUploaderConfigItem = {
  _id: 'id-work',
  _configName: 'Work',
  _createdAt: 1700000000000,
  _updatedAt: 1700000001000,
  repo: 'me/images',
  token: 'ghp_super_secret_token'
}

const githubHome: IUploaderConfigItem = {
  _id: 'id-home',
  _configName: 'Home',
  _createdAt: 1700000002000,
  _updatedAt: 1700000003000,
  repo: 'me/home',
  token: 'ghp_another_secret'
}

const configLists: Record<string, IUploaderConfigItem[]> = {
  github: [githubWork, githubHome],
  smms: []
}

interface UploaderHarness {
  ctx: IPicGo
  program: Command
  logError: ReturnType<typeof vi.fn>
  logSuccess: ReturnType<typeof vi.fn>
  rename: ReturnType<typeof vi.fn>
  copy: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const createHarness = (config: Record<string, unknown> = {}): UploaderHarness => {
  const program = new Command().name('picgo').exitOverride()
  const logError = vi.fn()
  const logSuccess = vi.fn()
  const rename = vi.fn()
  const copy = vi.fn()
  const remove = vi.fn()
  const fullConfig: Record<string, unknown> = {
    'uploader.github.defaultId': 'id-work',
    ...config
  }
  const ctx = {
    cmd: { program, inquirer: {} },
    getConfig: vi.fn((key: string) => fullConfig[key]),
    log: {
      error: logError,
      success: logSuccess,
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    },
    i18n: {
      translate: vi.fn((key: string, args?: Record<string, string>) => (args ? `${key} ${JSON.stringify(args)}` : key))
    },
    uploaderConfig: {
      listUploaderTypes: vi.fn(() => Object.keys(configLists)),
      getConfigList: vi.fn((type: string) => configLists[type] ?? []),
      rename,
      copy,
      remove
    }
  } as unknown as IPicGo
  uploader.handle(ctx)
  return { ctx, program, logError, logSuccess, rename, copy, remove }
}

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.exitCode = undefined
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  process.exitCode = undefined
  logSpy.mockRestore()
  errorSpy.mockRestore()
})

const stdoutLine = (): string => {
  expect(logSpy).toHaveBeenCalledTimes(1)
  return String(logSpy.mock.calls[0][0])
}

describe('picgo uploader list --format json', () => {
  it('prints a single JSON line with current uploader, default flags and empty configs', async () => {
    const { program } = createHarness({ 'picBed.uploader': 'github', 'picBed.current': 'smms' })

    await program.parseAsync(['node', 'picgo', 'uploader', 'list', '--format', 'json'])

    const line = stdoutLine()
    expect(line).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      current: 'github',
      uploaders: [
        {
          type: 'github',
          isCurrent: true,
          configs: [
            { id: 'id-work', name: 'Work', isDefault: true, createdAt: 1700000000000, updatedAt: 1700000001000 },
            { id: 'id-home', name: 'Home', isDefault: false, createdAt: 1700000002000, updatedAt: 1700000003000 }
          ]
        },
        { type: 'smms', isCurrent: false, configs: [] }
      ]
    })
    expect(process.exitCode).toBeUndefined()
  })

  it('never leaks config values such as tokens', async () => {
    const { program } = createHarness()

    await program.parseAsync(['node', 'picgo', 'uploader', 'list', '--format', 'json'])

    const line = stdoutLine()
    expect(line).not.toContain('ghp_super_secret_token')
    expect(line).not.toContain('ghp_another_secret')
    expect(line).not.toContain('token')
    expect(line).not.toContain('repo')
    expect(line).not.toContain('me/images')
  })

  it('resolves current like real uploads: picBed.current, then picgo-cloud', async () => {
    const first = createHarness({ 'picBed.current': 'smms' })
    await first.program.parseAsync(['node', 'picgo', 'uploader', 'list', '--format', 'json'])
    expect(JSON.parse(String(logSpy.mock.calls[0][0])).current).toBe('smms')

    logSpy.mockClear()
    const second = createHarness()
    await second.program.parseAsync(['node', 'picgo', 'uploader', 'list', '--format', 'json'])
    const parsed = JSON.parse(String(logSpy.mock.calls[0][0])) as { current: string, uploaders: Array<{ isCurrent: boolean }> }
    expect(parsed.current).toBe('picgo-cloud')
    expect(parsed.uploaders.every(item => !item.isCurrent)).toBe(true)
  })

  it('only lists the requested type', async () => {
    const { program } = createHarness()

    await program.parseAsync(['node', 'picgo', 'uploader', 'list', 'smms', '--format', 'json'])

    expect(JSON.parse(stdoutLine()).uploaders).toEqual([{ type: 'smms', isCurrent: false, configs: [] }])
  })

  it('unknown type in json mode: exit code 1, stdout empty, error on stderr', async () => {
    const { program } = createHarness()

    await program.parseAsync(['node', 'picgo', 'uploader', 'list', '__nope__', '--format', 'json'])

    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CLI_UPLOADER_TYPE_NOT_FOUND'))
    expect(process.exitCode).toBe(1)
  })

  it('unknown type in pretty mode: exit code 1, error on stderr', async () => {
    const { program } = createHarness()

    await program.parseAsync(['node', 'picgo', 'uploader', 'list', '__nope__'])

    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CLI_UPLOADER_TYPE_NOT_FOUND'))
    expect(process.exitCode).toBe(1)
  })

  it('pretty mode keeps the human-readable output', async () => {
    const { program } = createHarness({ 'picBed.current': 'github' })

    await program.parseAsync(['node', 'picgo', 'uploader', 'list'])

    const output = stdoutLine()
    expect(output).toContain('github [Current Uploader]')
    expect(output).toContain('Work [Default Config]')
    expect(output).toContain('(No configs found)')
    expect(process.exitCode).toBeUndefined()
  })
})

describe('picgo uploader rename/copy/rm exit codes', () => {
  it.each([
    ['rename', ['rename', 'github', 'Missing', 'New']],
    ['copy', ['copy', 'github', 'Missing', 'Copy']],
    ['remove', ['rm', 'github', 'Missing']]
  ] as const)('%s failure sets exit code 1', async (method, args) => {
    const harness = createHarness()
    harness[method].mockImplementation(() => {
      throw new Error('Config Missing not found in type github')
    })

    await harness.program.parseAsync(['node', 'picgo', 'uploader', ...args])

    expect(harness.logError).toHaveBeenCalledWith(expect.any(Error))
    expect(harness.logSuccess).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it.each([
    ['rename', ['rename', 'github', 'Work', 'Office']],
    ['copy', ['copy', 'github', 'Work', 'Work Copy']],
    ['remove', ['rm', 'github', 'Home']]
  ] as const)('%s success keeps exit code 0', async (method, args) => {
    const harness = createHarness()

    await harness.program.parseAsync(['node', 'picgo', 'uploader', ...args])

    expect(harness[method]).toHaveBeenCalled()
    expect(harness.logSuccess).toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })
})
