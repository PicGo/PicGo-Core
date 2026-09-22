import type { Env, Handler } from 'hono'
import type { IImgInfo, IServerManager, UploadOptions } from '.'

export interface IServerUploadAdapter {
  uploadClipboard: (options?: UploadOptions) => Promise<IImgInfo[] | Error>
  uploadPaths: (paths: string[], options?: UploadOptions) => Promise<IImgInfo[] | Error>
  getTempDir?: () => string
}

export interface IInternalServerManager<E extends Env = any> extends IServerManager<E> {
  registerGet<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  registerPost<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  registerPut<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  registerDelete<P extends string>(path: P, handler: Handler<E, P>, isInternal?: boolean): void
  setUploadAdapter(adapter?: IServerUploadAdapter): void
}
