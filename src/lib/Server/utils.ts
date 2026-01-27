import { Hono } from 'hono'
import { IPicGo } from '../../types'
import { isBuiltinRoutePath } from '../Routes/routePath'

/**
 * Route overriding helper.
 *
 * Logic:
 * 1. Business routes (GET/POST/...): last registration wins (override).
 * 2. Middlewares (ALL): preserve all in order (append).
 */
export const rebuildApp = <T extends Hono<any, any, any>>(draftApp: T, ctx: IPicGo): T => {
  const newApp = new Hono()

  const finalRoutes: Array<{
    method: string
    path: string
    handler: any
  }> = []

  const routeIndexMap = new Map<string, number>()

  draftApp.routes.forEach((route) => {
    if (route.method === 'ALL') {
      finalRoutes.push(route)
      return
    }

    const key = `${route.method}::${route.path}`
    const existingIndex = routeIndexMap.get(key)

    if (existingIndex !== undefined) {
      if (!isBuiltinRoutePath(route.path)) {
        ctx.log.warn(`Route conflict detected for [${route.method}] ${route.path}. Overriding previous handler.`)
      }
      finalRoutes[existingIndex] = route
    } else {
      const newIndex = finalRoutes.push(route) - 1
      routeIndexMap.set(key, newIndex)
    }
  })

  finalRoutes.forEach((route) => {
    newApp.on(route.method, route.path, route.handler)
  })

  return newApp as unknown as T
}
