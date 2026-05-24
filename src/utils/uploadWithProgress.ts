import type { AxiosProgressEvent, AxiosRequestConfig } from 'axios'
import type { IFileUploadProgress, IOldReqOptions, IPicGo, IResponse } from '../types'
import { IBuildInEvent } from './enum'

/**
 * 进度事件 payload 中 multipart 专属字段在单 PUT / 外部图床场景的占位值 ——
 * -1 表示 N/A。文档化为 ICloudUploaderManager / IFileUploadProgress 的约定。
 */
const NON_MULTIPART_PARTS_PLACEHOLDER = -1

/**
 * 调用 `uploadWithProgress` 时的元信息。fileName 必填（多文件场景下消费方靠它区分），
 * 其它字段都是可选 —— 不传时按"非 multipart 路径"占位。
 */
export interface IUploadProgressMeta {
  /** 当前正在上传的文件名（即 IImgInfo.fileName） */
  fileName: string
  /**
   * 文件总字节数。axios 上报的 progress 通常自带 `total`；某些 transport（如部分 SDK 包装的请求）
   * 不带，这时 helper 用 meta.totalBytes 回填。两者都没有则 emit 时 total = 0、fraction = 0。
   */
  totalBytes?: number
  /** multipart 路径专用：是否是断点续传场景。非 multipart 路径默认 false */
  resumed?: boolean
  /** multipart 路径专用：已完成 part 数。非 multipart 路径默认 -1 */
  partsCompleted?: number
  /** multipart 路径专用：总 part 数。非 multipart 路径默认 -1 */
  totalParts?: number
}

type SupportedConfig = AxiosRequestConfig | IOldReqOptions

/**
 * `ctx.request` 的薄封装。透传所有原配置，注入 axios 的 `onUploadProgress` 钩子，
 * 将进度转换为 `IBuildInEvent.FILE_UPLOAD_PROGRESS` 事件 emit 出去。返回值与 `ctx.request` 完全一致。
 *
 * 设计目的：建立"上传时报进度"的统一约定，所有内置 uploader 和外部插件都能用一行替换接入 ——
 * `await ctx.request(opts)` → `await uploadWithProgress(ctx, opts, { fileName })`。
 *
 * Multipart 路径的状态机不走这个 helper（part 级进度由状态机自行 emit，能带上 partsCompleted /
 * resumed 等 multipart 专属信息）。本 helper 服务于"单次 PUT/POST = 一个文件"这种简单场景。
 */
export async function uploadWithProgress<T> (
  ctx: IPicGo,
  options: SupportedConfig,
  meta: IUploadProgressMeta
): Promise<T> {
  const callerOnProgress = (options as AxiosRequestConfig).onUploadProgress
  const partsCompleted = meta.partsCompleted ?? NON_MULTIPART_PARTS_PLACEHOLDER
  const totalParts = meta.totalParts ?? NON_MULTIPART_PARTS_PLACEHOLDER
  const resumed = meta.resumed ?? false

  const onUploadProgress = (event: AxiosProgressEvent): void => {
    callerOnProgress?.(event)
    const reportedTotal = typeof event.total === 'number' ? event.total : undefined
    const total = reportedTotal ?? meta.totalBytes ?? 0
    const current = event.loaded
    const fraction = total > 0 ? Math.min(current / total, 1) : 0
    const payload: IFileUploadProgress = {
      fileName: meta.fileName,
      current,
      total,
      fraction,
      partsCompleted,
      totalParts,
      resumed
    }
    ctx.emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, payload)
  }

  const augmented = {
    ...options,
    onUploadProgress
  } as SupportedConfig

  // ctx.request 的泛型签名极复杂（兼容新旧 options 形态），这里用 IResponse 间接拿到目标返回类型即可。
  return ctx.request<T, SupportedConfig>(augmented) as unknown as Promise<T> & Promise<IResponse<T, SupportedConfig>>
}
