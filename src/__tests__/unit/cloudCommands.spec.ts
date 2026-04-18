import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IPicGo, AlbumListResponse } from '../../types'
import { cloud } from '../../plugins/commander/cloud'
import { createLoginAction } from '../../plugins/commander/cloud/actions/login'
import { createLogoutAction } from '../../plugins/commander/cloud/actions/logout'
import { createCloudListAction } from '../../plugins/commander/cloud/list'

vi.mock('ora', () => {
  const mockSpinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    isSpinning: false,
    text: ''
  }
  return { default: () => mockSpinner }
})

interface MockCommand {
  command: ReturnType<typeof vi.fn>
  description: ReturnType<typeof vi.fn>
  arguments: ReturnType<typeof vi.fn>
  argument: ReturnType<typeof vi.fn>
  option: ReturnType<typeof vi.fn>
  action: ReturnType<typeof vi.fn>
}

const createMockCommand = (): MockCommand => {
  const mock: MockCommand = {
    command: vi.fn(),
    description: vi.fn(),
    arguments: vi.fn(),
    argument: vi.fn(),
    option: vi.fn(),
    action: vi.fn()
  }
  mock.command.mockReturnValue(mock)
  mock.description.mockReturnValue(mock)
  mock.arguments.mockReturnValue(mock)
  mock.argument.mockReturnValue(mock)
  mock.option.mockReturnValue(mock)
  mock.action.mockReturnValue(mock)
  return mock
}

const createMockCtx = (overrides?: Partial<{
  cloud: Partial<IPicGo['cloud']>
  log: Partial<IPicGo['log']>
}>): { ctx: IPicGo; program: MockCommand } => {
  const program = createMockCommand()
  const ctx = {
    cmd: { program, inquirer: {} },
    cloud: {
      login: vi.fn(),
      logout: vi.fn(),
      album: {
        list: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        import: vi.fn(),
        getPending: vi.fn(),
        retryPending: vi.fn()
      },
      ...overrides?.cloud
    },
    log: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      ...overrides?.log
    },
    getConfig: vi.fn((key: string) => {
      if (key === 'settings.picgoCloud.token') return 'test-token'
      return undefined
    }),
    i18n: {
      translate: vi.fn((key: string) => key)
    }
  } as unknown as IPicGo
  return { ctx, program }
}

describe('cloud command structure', () => {
  it('registers cloud as top-level command with subcommands', () => {
    const { ctx, program } = createMockCtx()

    const commandNames: string[] = []
    program.command.mockImplementation((name: string) => {
      commandNames.push(name)
      return createMockCommand()
    })

    cloud.handle(ctx)

    expect(program.command).toHaveBeenCalledWith('cloud')
  })

  it('registers album subcommand group under cloud', () => {
    const { ctx, program } = createMockCtx()

    const cloudCmd = createMockCommand()
    const albumCmd = createMockCommand()

    const albumSubcommands: string[] = []
    albumCmd.command.mockImplementation((name: string) => {
      albumSubcommands.push(name)
      return createMockCommand()
    })

    const cloudSubcommands: string[] = []
    program.command.mockImplementation((name: string) => {
      cloudSubcommands.push(name)
      if (name === 'cloud') return cloudCmd
      return createMockCommand()
    })
    cloudCmd.command.mockImplementation((name: string) => {
      cloudSubcommands.push(`cloud.${name}`)
      if (name === 'album') return albumCmd
      return createMockCommand()
    })

    cloud.handle(ctx)

    expect(cloudSubcommands).toContain('cloud')
    expect(cloudSubcommands).toContain('cloud.album')
    expect(cloudSubcommands).toContain('cloud.login')
    expect(cloudSubcommands).toContain('cloud.logout')
    expect(cloudSubcommands).toContain('cloud.config')
    // aliases
    expect(cloudSubcommands).toContain('cloud.list')
    expect(cloudSubcommands).toContain('cloud.import')

    // album subcommands
    expect(albumSubcommands).toContain('import')
    expect(albumSubcommands).toContain('list')
    expect(albumSubcommands).toContain('get')
    expect(albumSubcommands).toContain('update')
    expect(albumSubcommands).toContain('delete')
    expect(albumSubcommands).toContain('retry')
  })
})

describe('cloud login action', () => {
  it('calls ctx.cloud.login with token', async () => {
    const { ctx } = createMockCtx()
    const action = createLoginAction(ctx)

    await action('test-token')

    expect(ctx.cloud.login).toHaveBeenCalledWith('test-token')
  })

  it('calls ctx.cloud.login without token', async () => {
    const { ctx } = createMockCtx()
    const action = createLoginAction(ctx)

    await action()

    expect(ctx.cloud.login).toHaveBeenCalledWith(undefined)
  })

  it('logs error on failure', async () => {
    const error = new Error('login failed')
    const { ctx } = createMockCtx({
      cloud: { login: vi.fn().mockRejectedValue(error) }
    })
    const action = createLoginAction(ctx)

    await action('token')

    expect(ctx.log.error).toHaveBeenCalledWith(error)
  })
})

describe('cloud logout action', () => {
  it('calls ctx.cloud.logout', async () => {
    const { ctx } = createMockCtx()
    const action = createLogoutAction(ctx)

    await action()

    expect(ctx.cloud.logout).toHaveBeenCalledTimes(1)
  })

  it('logs error on failure', async () => {
    const error = new Error('logout failed')
    const { ctx } = createMockCtx({
      cloud: {
        logout: () => { throw error }
      }
    })
    const action = createLogoutAction(ctx)

    await action()

    expect(ctx.log.error).toHaveBeenCalledWith(error)
  })
})

describe('cloud album list action', () => {
  const mockListResponse: AlbumListResponse = {
    success: true,
    items: [
      { id: 'id-1', imgUrl: 'https://example.com/1.png', fileName: '1.png' },
      { id: 'id-2', imgUrl: 'https://example.com/2.png', fileName: '2.png' }
    ],
    total: 2,
    limit: 20,
    offset: 0
  }

  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('outputs pretty format by default', async () => {
    const { ctx } = createMockCtx()
    ;(ctx.cloud.album.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockListResponse)
    const action = createCloudListAction(ctx)

    await action({ format: 'pretty' })

    // Should output header + 2 rows + summary
    expect(consoleSpy).toHaveBeenCalled()
    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(allOutput).toContain('ID')
    expect(allOutput).toContain('URL')
    expect(allOutput).toContain('id-1')
    expect(allOutput).toContain('id-2')
    expect(allOutput).toContain('Total: 2')
  })

  it('outputs compact JSON when format is json', async () => {
    const { ctx } = createMockCtx()
    ;(ctx.cloud.album.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockListResponse)
    const action = createCloudListAction(ctx)

    await action({ format: 'json' })

    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      try {
        JSON.parse(c[0] as string)
        return true
      } catch {
        return false
      }
    })
    expect(jsonCalls.length).toBe(1)
    const parsed = JSON.parse(jsonCalls[0][0] as string)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.total).toBe(2)
  })

  it('passes query parameters to album.list', async () => {
    const { ctx } = createMockCtx()
    ;(ctx.cloud.album.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockListResponse)
    const action = createCloudListAction(ctx)

    await action({ type: 'tcyun', limit: '10', format: 'pretty' })

    expect(ctx.cloud.album.list).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tcyun', limit: 10 })
    )
  })
})

describe('--format option', () => {
  it('all album commands register --format with pretty as default', () => {
    const { ctx, program } = createMockCtx()

    const cloudCmd = createMockCommand()
    const albumCmd = createMockCommand()

    // Track all option() calls on album subcommands
    const optionCalls: string[][] = []
    const subCmd = createMockCommand()
    subCmd.option.mockImplementation((...args: string[]) => {
      optionCalls.push(args)
      return subCmd
    })

    albumCmd.command.mockReturnValue(subCmd)
    program.command.mockImplementation((name: string) => {
      if (name === 'cloud') return cloudCmd
      return createMockCommand()
    })
    cloudCmd.command.mockImplementation((name: string) => {
      if (name === 'album') return albumCmd
      return cloudCmd
    })

    cloud.handle(ctx)

    const formatOptions = optionCalls.filter(args => args[0] === '--format <format>')
    // Each album subcommand should have --format with 'pretty' default
    expect(formatOptions.length).toBeGreaterThanOrEqual(1)
    for (const args of formatOptions) {
      expect(args[1]).toBe('output format: pretty | json')
      expect(args[2]).toBe('pretty')
    }
  })
})
