import { describe, it, expect, vi } from 'vitest'
import type { IPicGo } from '../../types'
import { cloud } from '../../plugins/commander/cloud'
import { createLoginAction } from '../../plugins/commander/cloud/actions/login'
import { createLogoutAction } from '../../plugins/commander/cloud/actions/logout'

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
      album: {},
      ...overrides?.cloud
    },
    log: {
      error: vi.fn(),
      ...overrides?.log
    }
  } as unknown as IPicGo
  return { ctx, program }
}

describe('cloud command structure', () => {
  it('registers cloud as top-level command with subcommands', () => {
    const { ctx, program } = createMockCtx()

    // Track all command() calls and their children
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
