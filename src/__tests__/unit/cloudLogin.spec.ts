import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ICloudManager, ICommander, IPicGo } from '../../types'
import { CloudManager } from '../../lib/Cloud'
import { logout as logoutCommand } from '../../plugins/commander/logout'

const axiosPostMock = vi.hoisted(() => {
  return vi.fn()
})

vi.mock('axios', () => {
  return {
    default: {
      post: axiosPostMock,
      isAxiosError: (error: unknown) => {
        return typeof error === 'object' && error !== null && 'isAxiosError' in error && (error as { isAxiosError?: boolean }).isAxiosError === true
      }
    }
  }
})

type II18nMock = {
  translate: ReturnType<typeof vi.fn>
}

type CallbackResponse = {
  body: string
  status: number
}

type CallbackContext = {
  req: {
    query: (key: string) => string | undefined
  }
  html: (body: string, status?: number) => CallbackResponse
}

type CallbackHandler = (c: CallbackContext) => CallbackResponse | Promise<CallbackResponse>

const createI18n = (): II18nMock => {
  return {
    translate: vi.fn((key: string, args?: Record<string, string>) => {
      if (key === 'CLOUD_LOGIN_CANCELLED') return 'Login cancelled'
      if (key === 'CLOUD_LOGIN_IN_PROGRESS') return 'Login is already in progress'
      if (key === 'CLOUD_LOGIN_INVALID_TOKEN') return 'Invalid token'
      if (key === 'CLOUD_LOGIN_SUCCESS') return 'Login success!'
      if (key === 'CLOUD_LOGOUT_SUCCESS') return 'Logout success!'
      if (key === 'CLOUD_LOGIN_SERVER_START_FAILED') return 'Failed to start PicGo server for login'
      if (key === 'CLOUD_LOGIN_OPEN_BROWSER_FAILED') return `Failed to open browser automatically: ${args?.message ?? ''}`
      if (key === 'CLOUD_LOGIN_OPEN_BROWSER_TIP') return `Please open this url in browser: ${args?.url ?? ''}`
      if (key === 'CLOUD_LOGIN_STATE_MISMATCH_WARN') return 'State mismatch or missing. Request blocked.'
      if (key === 'CLOUD_LOGIN_STATE_INVALID') return 'Invalid state. Please try logging in again.'
      if (key === 'CLOUD_LOGIN_TOKEN_MISSING') return 'Token missing in callback.'
      if (key === 'CLOUD_LOGIN_CODE_MISSING') return 'Code missing in callback.'
      if (key === 'CLOUD_LOGIN_EXCHANGE_FAILED') return 'Failed to exchange login code.'
      if (key === 'CLOUD_LOGIN_NOT_IN_PROGRESS') return 'Login flow is not in progress.'
      if (key === 'CLOUD_LOGIN_PAGE_TITLE') return 'PicGo Auth'
      if (key === 'CLOUD_LOGIN_RESULT_SUCCESS_TITLE') return 'Authorization Successful!'
      if (key === 'CLOUD_LOGIN_RESULT_FAILED_TITLE') return 'Authorization Failed'
      if (key === 'CLOUD_LOGIN_RESULT_SUCCESS_MESSAGE') return 'You can now close this window and return to PicGo.'
      return key
    })
  }
}

const createCloud = (serverWasListening: boolean): {
  cloud: CloudManager
  ctx: IPicGo
  openUrl: ReturnType<typeof vi.fn>
  openUrlCalled: Promise<string>
  server: {
    isListening: ReturnType<typeof vi.fn>
    listen: ReturnType<typeof vi.fn>
    shutdown: ReturnType<typeof vi.fn>
    registerGet: ReturnType<typeof vi.fn>
  }
  i18n: II18nMock
  authCallbackHandler: CallbackHandler
} => {
  const log = {
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }

  let resolveOpenUrl: ((url: string) => void) | undefined
  const openUrlCalled = new Promise<string>(resolve => {
    resolveOpenUrl = resolve
  })
  const openUrl = vi.fn(async (url: string) => {
    resolveOpenUrl?.(url)
  })
  let authCallbackHandler: CallbackHandler | undefined
  const server = {
    isListening: vi.fn(() => serverWasListening),
    listen: vi.fn(async () => 36677),
    shutdown: vi.fn(),
    registerGet: vi.fn((path: string, handler: CallbackHandler) => {
      if (path === '/auth/callback') {
        authCallbackHandler = handler
      }
    })
  }

  const i18n = createI18n()

  const ctx = {
    log,
    i18n,
    server,
    getConfig: vi.fn((_key?: string) => undefined),
    saveConfig: vi.fn(),
    removeConfig: vi.fn(),
    openUrl
  } as unknown as IPicGo

  const cloud = new CloudManager(ctx)
  if (!authCallbackHandler) {
    throw new Error('Auth callback handler not registered')
  }

  return { cloud, ctx, openUrl, openUrlCalled, server, i18n, authCallbackHandler }
}

const createCallbackContext = (query: Record<string, string | undefined>): { ctx: CallbackContext; response: CallbackResponse } => {
  const response: CallbackResponse = { body: '', status: 0 }
  const ctx: CallbackContext = {
    req: {
      query: (key: string) => query[key]
    },
    html: (body: string, status = 200) => {
      response.body = body
      response.status = status
      return response
    }
  }
  return { ctx, response }
}

const getLoginParams = (authUrl: string): { callback: string | null; state: string | null; challenge: string | null } => {
  const url = new URL(authUrl)
  return {
    callback: url.searchParams.get('callback'),
    state: url.searchParams.get('state'),
    challenge: url.searchParams.get('challenge')
  }
}

describe('CloudManager login flow disposal', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('disposeLoginFlow rejects login and shuts down temporary server', async () => {
    vi.useFakeTimers()
    const { cloud, server } = createCloud(false)

    const loginPromise = cloud.login()
    cloud.disposeLoginFlow()

    await expect(loginPromise).rejects.toThrow('Login cancelled')

    expect(server.shutdown).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(server.shutdown).toHaveBeenCalledTimes(1)
  })

  it('disposeLoginFlow does not shut down an existing server', async () => {
    vi.useFakeTimers()
    const { cloud, server } = createCloud(true)

    const loginPromise = cloud.login()
    cloud.disposeLoginFlow()

    await expect(loginPromise).rejects.toThrow('Login cancelled')

    vi.advanceTimersByTime(200)
    expect(server.shutdown).not.toHaveBeenCalled()
  })

  it('allows a new login flow after dispose', async () => {
    vi.useFakeTimers()
    const { cloud, server } = createCloud(false)

    const loginPromise1 = cloud.login()
    cloud.disposeLoginFlow()
    await expect(loginPromise1).rejects.toThrow('Login cancelled')

    vi.advanceTimersByTime(100)
    expect(server.listen).toHaveBeenCalledTimes(1)

    const loginPromise2 = cloud.login()
    cloud.disposeLoginFlow()
    await expect(loginPromise2).rejects.toThrow('Login cancelled')

    vi.advanceTimersByTime(100)
    expect(server.listen).toHaveBeenCalledTimes(2)
  })

  it('disposeLoginFlow is a no-op when no login is in progress', () => {
    const { cloud } = createCloud(false)
    expect(() => cloud.disposeLoginFlow()).not.toThrow()
  })
})

describe('CloudManager PKCE login flow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('includes PKCE challenge in auth URL', async () => {
    const { cloud, openUrlCalled } = createCloud(false)

    const loginPromise = cloud.login()

    const authUrl = await openUrlCalled
    const { callback, state, challenge } = getLoginParams(authUrl)
    expect(callback).toBe('http://127.0.0.1:36677/auth/callback')
    expect(state).toBeTruthy()
    expect(challenge).toBeTruthy()
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)

    cloud.disposeLoginFlow()
    await expect(loginPromise).rejects.toThrow('Login cancelled')
  })

  it('exchanges code and persists token', async () => {
    const { cloud, ctx, openUrlCalled, authCallbackHandler } = createCloud(false)

    axiosPostMock.mockResolvedValue({
      data: { success: true, token: 'token-123' }
    })

    const loginPromise = cloud.login()
    const authUrl = await openUrlCalled
    const { state } = getLoginParams(authUrl)
    const { ctx: callbackCtx, response } = createCallbackContext({ state: state ?? undefined, code: 'auth-code' })
    await authCallbackHandler(callbackCtx)

    await expect(loginPromise).resolves.toBeUndefined()
    expect(ctx.saveConfig).toHaveBeenCalledWith({ 'settings.picgoCloud.token': 'token-123' })
    expect(response.status).toBe(200)
  })

  it('returns API message on exchange failure and rejects login', async () => {
    const { cloud, ctx, openUrlCalled, authCallbackHandler } = createCloud(false)

    axiosPostMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: 'Invalid code' }
      }
    })

    const loginPromise = cloud.login()
    const authUrl = await openUrlCalled
    const { state } = getLoginParams(authUrl)
    const { ctx: callbackCtx, response } = createCallbackContext({ state: state ?? undefined, code: 'bad-code' })
    await authCallbackHandler(callbackCtx)

    await expect(loginPromise).rejects.toThrow('Invalid code')
    expect(ctx.saveConfig).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    expect(response.body).toContain('Invalid code')
  })

  it('rejects when code is missing', async () => {
    const { cloud, openUrlCalled, authCallbackHandler } = createCloud(false)

    const loginPromise = cloud.login()
    const authUrl = await openUrlCalled
    const { state } = getLoginParams(authUrl)
    const { ctx: callbackCtx, response } = createCallbackContext({ state: state ?? undefined })
    await authCallbackHandler(callbackCtx)

    await expect(loginPromise).rejects.toThrow('Code missing in callback.')
    expect(response.status).toBe(400)
  })

  it('returns 403 on state mismatch and keeps login pending', async () => {
    const { cloud, openUrlCalled, authCallbackHandler } = createCloud(false)

    const loginPromise = cloud.login()
    const authUrl = await openUrlCalled
    const { state } = getLoginParams(authUrl)
    const { ctx: callbackCtx, response } = createCallbackContext({ state: state ? `${state}-wrong` : 'state-wrong', code: 'auth-code' })
    await authCallbackHandler(callbackCtx)

    expect(response.status).toBe(403)
    cloud.disposeLoginFlow()
    await expect(loginPromise).rejects.toThrow('Login cancelled')
  })
})

describe('CloudManager getUserInfo', () => {
  it('returns null when no token is persisted', async () => {
    const { cloud, ctx } = createCloud(false)
    const whoamiSpy = vi.spyOn(cloud.user, 'whoami')

    const res = await cloud.getUserInfo()

    expect(res).toBeNull()
    expect(whoamiSpy).not.toHaveBeenCalled()
    expect(ctx.removeConfig).not.toHaveBeenCalled()
  })

  it('returns user info when whoami succeeds', async () => {
    const { cloud, ctx } = createCloud(false)
    ;(ctx.getConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token')

    const whoamiSpy = vi.spyOn(cloud.user, 'whoami').mockResolvedValue({
      user: 'molunerfinn'
    })

    const res = await cloud.getUserInfo()

    expect(res).toEqual({ user: 'molunerfinn' })
    expect(whoamiSpy).toHaveBeenCalledWith('token')
    expect(ctx.removeConfig).not.toHaveBeenCalled()
  })

  it.each([401, 403])('clears token and returns null when whoami returns %s', async (status) => {
    const { cloud, ctx } = createCloud(false)
    ;(ctx.getConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token')

    vi.spyOn(cloud.user, 'whoami').mockRejectedValue({
      isAxiosError: true,
      message: 'invalid',
      response: {
        status
      }
    })

    const res = await cloud.getUserInfo()

    expect(res).toBeNull()
    expect(ctx.removeConfig).toHaveBeenCalledWith('settings.picgoCloud', 'token')
  })

  it('throws when whoami fails with non-401/403 axios error', async () => {
    const { cloud, ctx } = createCloud(false)
    ;(ctx.getConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token')

    vi.spyOn(cloud.user, 'whoami').mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed',
      response: {
        status: 500,
        data: {
          message: 'server error'
        }
      }
    })

    await expect(cloud.getUserInfo()).rejects.toThrow('server error')
  })
})

describe('CloudManager logout', () => {
  it('clears token and logs success', () => {
    const { cloud, ctx } = createCloud(false)

    cloud.logout()

    expect(ctx.removeConfig).toHaveBeenCalledWith('settings.picgoCloud', 'token')
    expect(ctx.log.success).toHaveBeenCalledWith('Logout success!')
  })
})

describe('logout command', () => {
  it('calls cloud.logout', async () => {
    let actionHandler: (() => void | Promise<void>) | undefined
    const commandBuilder = {
      description: vi.fn().mockReturnThis(),
      action: vi.fn((handler: () => void | Promise<void>) => {
        actionHandler = handler
        return commandBuilder
      })
    }
    const program = {
      command: vi.fn(() => commandBuilder)
    }
    const cloud = {
      logout: vi.fn()
    }
    const ctx = {
      cmd: {
        program,
        inquirer: {}
      },
      cloud,
      log: {
        error: vi.fn()
      }
    } as unknown as IPicGo

    logoutCommand.handle(ctx)

    expect(program.command).toHaveBeenCalledWith('logout')
    expect(commandBuilder.description).toHaveBeenCalledWith('logout from cloud.picgo.app')
    expect(actionHandler).toBeDefined()

    await actionHandler?.()

    expect(cloud.logout).toHaveBeenCalledTimes(1)
  })

  it('logs errors from cloud.logout', async () => {
    let actionHandler: (() => void | Promise<void>) | undefined
    const commandBuilder = {
      description: vi.fn().mockReturnThis(),
      action: vi.fn((handler: () => void | Promise<void>) => {
        actionHandler = handler
        return commandBuilder
      })
    }
    const program = {
      command: vi.fn(() => commandBuilder)
    }
    const error = new Error('logout failed')
    const cloud: ICloudManager = {
      login: async () => {},
      logout: () => {
        throw error
      },
      disposeLoginFlow: () => {},
      getUserInfo: async () => null
    }
    const logError = vi.fn()
    const ctx = {
      cmd: {
        program,
        inquirer: {}
      } as unknown as ICommander,
      cloud,
      log: {
        error: logError
      }
    } as unknown as IPicGo

    logoutCommand.handle(ctx)
    await actionHandler?.()

    expect(logError).toHaveBeenCalledWith(error)
  })
})
