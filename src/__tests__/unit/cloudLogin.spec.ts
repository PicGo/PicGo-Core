import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPicGo } from '../../types'
import { CloudManager } from '../../lib/Cloud'

type II18nMock = {
  translate: ReturnType<typeof vi.fn>
}

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
  server: {
    isListening: ReturnType<typeof vi.fn>
    listen: ReturnType<typeof vi.fn>
    shutdown: ReturnType<typeof vi.fn>
    registerGet: ReturnType<typeof vi.fn>
  }
  i18n: II18nMock
} => {
  const log = {
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }

  const server = {
    isListening: vi.fn(() => serverWasListening),
    listen: vi.fn(async () => 36677),
    shutdown: vi.fn(),
    registerGet: vi.fn((_path: string, _handler: unknown, _isInternal?: boolean) => {})
  }

  const i18n = createI18n()

  const ctx = {
    log,
    i18n,
    server,
    getConfig: vi.fn((_key?: string) => undefined),
    saveConfig: vi.fn(),
    removeConfig: vi.fn(),
    openUrl: vi.fn(async () => {})
  } as unknown as IPicGo

  const cloud = new CloudManager(ctx)

  return { cloud, ctx, server, i18n }
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
