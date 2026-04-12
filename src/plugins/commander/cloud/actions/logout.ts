import type { IPicGo } from '../../../../types'

export const createLogoutAction = (ctx: IPicGo) => {
  return async (): Promise<void> => {
    try {
      ctx.cloud.logout()
    } catch (e) {
      ctx.log.error(e as Error)
    }
  }
}
