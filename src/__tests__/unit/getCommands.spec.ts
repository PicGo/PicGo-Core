import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IPicGo } from '../../types'
import {
  get,
  resolveUploader,
  resolveTransformer,
  resolvePlugins,
  createUploaderAction,
  createTransformerAction,
  createPluginsAction
} from '../../plugins/commander/get'

interface MockCommand {
  command: ReturnType<typeof vi.fn>
  description: ReturnType<typeof vi.fn>
  option: ReturnType<typeof vi.fn>
  action: ReturnType<typeof vi.fn>
}

const createMockCommand = (): MockCommand => {
  const mock: MockCommand = {
    command: vi.fn(),
    description: vi.fn(),
    option: vi.fn(),
    action: vi.fn()
  }
  mock.command.mockReturnValue(mock)
  mock.description.mockReturnValue(mock)
  mock.option.mockReturnValue(mock)
  mock.action.mockReturnValue(mock)
  return mock
}

type ConfigMap = Record<string, unknown>

const createMockCtx = (config: ConfigMap = {}): { ctx: IPicGo; program: MockCommand } => {
  const program = createMockCommand()
  const ctx = {
    cmd: { program },
    getConfig: vi.fn((key: string) => config[key]),
    i18n: {
      translate: vi.fn((key: string) => key)
    }
  } as unknown as IPicGo
  return { ctx, program }
}

describe('get command structure', () => {
  it('registers get as top-level command with three subcommands', () => {
    const { ctx, program } = createMockCtx()

    const getCmd = createMockCommand()
    const subcommands: string[] = []
    program.command.mockImplementation((name: string) => {
      if (name === 'get') return getCmd
      return createMockCommand()
    })
    getCmd.command.mockImplementation((name: string) => {
      subcommands.push(name)
      return createMockCommand()
    })

    get.handle(ctx)

    expect(program.command).toHaveBeenCalledWith('get')
    expect(subcommands).toContain('uploader')
    expect(subcommands).toContain('transformer')
    expect(subcommands).toContain('plugins')
  })

  it('each subcommand registers --format with pretty default', () => {
    const { ctx, program } = createMockCtx()

    const getCmd = createMockCommand()
    const optionCalls: string[][] = []
    program.command.mockImplementation((name: string) => {
      if (name === 'get') return getCmd
      return createMockCommand()
    })
    getCmd.command.mockImplementation(() => {
      const sub = createMockCommand()
      sub.option.mockImplementation((...args: string[]) => {
        optionCalls.push(args)
        return sub
      })
      return sub
    })

    get.handle(ctx)

    const formatOptions = optionCalls.filter(args => args[0] === '--format <format>')
    expect(formatOptions.length).toBe(3)
    for (const args of formatOptions) {
      expect(args[1]).toBe('output format: pretty | json')
      expect(args[2]).toBe('pretty')
    }
  })
})

describe('resolveUploader', () => {
  it('uses picBed.uploader when present', () => {
    const { ctx } = createMockCtx({ 'picBed.uploader': 'github' })
    expect(resolveUploader(ctx)).toBe('github')
  })

  it('falls back to picBed.current', () => {
    const { ctx } = createMockCtx({ 'picBed.current': 'smms' })
    expect(resolveUploader(ctx)).toBe('smms')
  })

  it('falls back to PICGO_CLOUD (picgo-cloud), not smms, when nothing is configured', () => {
    const { ctx } = createMockCtx({})
    expect(resolveUploader(ctx)).toBe('picgo-cloud')
  })
})

describe('resolveTransformer', () => {
  it('uses picBed.transformer when present', () => {
    const { ctx } = createMockCtx({ 'picBed.transformer': 'base64' })
    expect(resolveTransformer(ctx)).toBe('base64')
  })

  it('falls back to path', () => {
    const { ctx } = createMockCtx({})
    expect(resolveTransformer(ctx)).toBe('path')
  })
})

describe('resolvePlugins', () => {
  it('reads enabled state from config picgoPlugins', () => {
    const { ctx } = createMockCtx({
      picgoPlugins: { 'picgo-plugin-a': true, 'picgo-plugin-b': false }
    })
    const plugins = resolvePlugins(ctx)
    expect(plugins).toEqual([
      { name: 'picgo-plugin-a', enabled: true },
      { name: 'picgo-plugin-b', enabled: false }
    ])
  })

  it('returns empty array when no plugins', () => {
    const { ctx } = createMockCtx({})
    expect(resolvePlugins(ctx)).toEqual([])
  })
})

describe('get actions output', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  const jsonLine = (): string => {
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    const line = consoleSpy.mock.calls[0][0] as string
    expect(() => JSON.parse(line)).not.toThrow()
    return line
  }

  it('uploader pretty prints the bare value', () => {
    const { ctx } = createMockCtx({ 'picBed.uploader': 'github' })
    createUploaderAction(ctx)({ format: 'pretty' })
    expect(consoleSpy).toHaveBeenCalledWith('github')
  })

  it('uploader json outputs a single parseable line', () => {
    const { ctx } = createMockCtx({ 'picBed.uploader': 'github' })
    createUploaderAction(ctx)({ format: 'json' })
    expect(JSON.parse(jsonLine())).toEqual({ uploader: 'github' })
  })

  it('uploader json falls back to picgo-cloud', () => {
    const { ctx } = createMockCtx({})
    createUploaderAction(ctx)({ format: 'json' })
    expect(JSON.parse(jsonLine())).toEqual({ uploader: 'picgo-cloud' })
  })

  it('transformer json outputs a single parseable line with path fallback', () => {
    const { ctx } = createMockCtx({})
    createTransformerAction(ctx)({ format: 'json' })
    expect(JSON.parse(jsonLine())).toEqual({ transformer: 'path' })
  })

  it('plugins json outputs a single parseable array', () => {
    const { ctx } = createMockCtx({
      picgoPlugins: { 'picgo-plugin-a': true, 'picgo-plugin-b': false }
    })
    createPluginsAction(ctx)({ format: 'json' })
    const parsed = JSON.parse(jsonLine())
    expect(parsed.plugins).toEqual([
      { name: 'picgo-plugin-a', enabled: true },
      { name: 'picgo-plugin-b', enabled: false }
    ])
  })

  it('plugins pretty prints enabled/disabled per line', () => {
    const { ctx } = createMockCtx({
      picgoPlugins: { 'picgo-plugin-a': true, 'picgo-plugin-b': false }
    })
    createPluginsAction(ctx)({ format: 'pretty' })
    const out = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(out).toContain('picgo-plugin-a')
    expect(out).toContain('enabled')
    expect(out).toContain('disabled')
  })

  it('plugins pretty prints empty i18n message when none installed', () => {
    const { ctx } = createMockCtx({})
    createPluginsAction(ctx)({ format: 'pretty' })
    expect(consoleSpy).toHaveBeenCalledWith('GET_PLUGINS_EMPTY')
  })

  it('plugins json outputs empty array when none installed', () => {
    const { ctx } = createMockCtx({})
    createPluginsAction(ctx)({ format: 'json' })
    expect(JSON.parse(jsonLine())).toEqual({ plugins: [] })
  })
})
