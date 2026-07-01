import type { Command } from 'commander'
import type { ICloudUserInfo, IPicGo } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { printCompactJson } from './shared'

interface CloudAuthStatusOptions {
  format?: string
}

type CloudAuthStatus = 'logged_in' | 'logged_out' | 'invalid' | 'error'

interface CloudAuthStatusResult {
  status: CloudAuthStatus
  loggedIn: boolean
  user?: string | null
  plan?: number
  message?: string
}

// exit code 约定：logged_in=0、logged_out=1、invalid=2、error=3。
const EXIT_CODE: Record<CloudAuthStatus, number> = {
  logged_in: 0,
  logged_out: 1,
  invalid: 2,
  error: 3
}

const resolveCloudAuthStatus = async (ctx: IPicGo): Promise<CloudAuthStatusResult> => {
  // 先读本地 token：getUserInfo() 遇 401 会清掉本地 token，必须在调用它之前判断，
  // 否则无法区分 logged_out（本来就无 token）与 invalid（有 token 但已失效）。
  const token = ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
  if (!token) {
    // logged_out 路径：完全不发网络请求，瞬间返回。
    return { status: 'logged_out', loggedIn: false }
  }

  try {
    const userInfo: ICloudUserInfo | null = await ctx.cloud.getUserInfo()
    if (userInfo) {
      return {
        status: 'logged_in',
        loggedIn: true,
        user: userInfo.user,
        plan: userInfo.plan
      }
    }
    // userInfo 为 null：token 已失效（401 已被 getUserInfo 清除）。
    return { status: 'invalid', loggedIn: false }
  } catch (error: unknown) {
    // 非 401 的网络错误 / 服务端错误：探测失败，不能误判成 logged_out。
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'error', loggedIn: false, message }
  }
}

const buildJsonPayload = (result: CloudAuthStatusResult): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    status: result.status,
    loggedIn: result.loggedIn
  }
  if (result.status === 'logged_in') {
    payload.user = result.user ?? null
    if (typeof result.plan === 'number') {
      payload.plan = result.plan
    }
  }
  if (result.status === 'error' && result.message) {
    payload.message = result.message
  }
  return payload
}

const printPretty = (ctx: IPicGo, result: CloudAuthStatusResult): void => {
  switch (result.status) {
    case 'logged_in':
      ctx.log.success(
        ctx.i18n.translate<ILocalesKey>('CLOUD_AUTH_STATUS_LOGGED_IN', {
          user: result.user ?? ''
        })
      )
      break
    case 'logged_out':
      ctx.log.warn(ctx.i18n.translate<ILocalesKey>('CLOUD_AUTH_STATUS_LOGGED_OUT'))
      ctx.log.info(ctx.i18n.translate<ILocalesKey>('CLOUD_COMMAND_LOGIN_HINT'))
      break
    case 'invalid':
      ctx.log.warn(ctx.i18n.translate<ILocalesKey>('CLOUD_AUTH_STATUS_INVALID'))
      ctx.log.info(ctx.i18n.translate<ILocalesKey>('CLOUD_COMMAND_LOGIN_HINT'))
      break
    case 'error':
      ctx.log.error(
        ctx.i18n.translate<ILocalesKey>('CLOUD_AUTH_STATUS_ERROR', {
          message: result.message ?? ''
        })
      )
      break
  }
}

const createCloudAuthStatusAction = (ctx: IPicGo) => {
  return async (options: CloudAuthStatusOptions = {}): Promise<CloudAuthStatusResult> => {
    const result = await resolveCloudAuthStatus(ctx)

    if (options.format === 'json') {
      // json 模式 stdout 只许这一行 JSON，不能被 ctx.log / spinner 污染。
      printCompactJson(buildJsonPayload(result))
    } else {
      printPretty(ctx, result)
    }

    // 用 process.exitCode 而非 process.exit，避免截断未 flush 的 json 输出。
    process.exitCode = EXIT_CODE[result.status]
    return result
  }
}

const registerCloudAuthStatusCommand = (ctx: IPicGo, authCommand: Command): void => {
  const action = createCloudAuthStatusAction(ctx)
  authCommand
    .command('status')
    .description('check PicGo Cloud login status (non-blocking)')
    .option('--format <format>', 'output format: pretty | json', 'pretty')
    .action(async (options: CloudAuthStatusOptions) => {
      await action(options)
    })
}

export { createCloudAuthStatusAction, registerCloudAuthStatusCommand }
