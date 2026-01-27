import { Env, Handler } from "hono"
import { IServerManager } from "."

export interface IInternalServerManager<E extends Env = any> extends IServerManager<E> {
  registerGet<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  registerPost<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  registerPut<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  registerDelete<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
}