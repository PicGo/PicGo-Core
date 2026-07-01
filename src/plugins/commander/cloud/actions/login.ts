import type { IPicGo } from '../../../../types'

export const createLoginAction = (ctx: IPicGo) => {
  return async (token?: string): Promise<void> => {
    try {
      await ctx.cloud.login(token)
    } catch (e) {
      ctx.log.error(e as Error)
    }
  }
}
