import type { AxiosProgressEvent, AxiosRequestConfig } from 'axios'
import type { IFileUploadProgress, IOldReqOptions, IPicGo, IResponse } from '../types'
import { IBuildInEvent } from './enum'

/**
 * Placeholder for multipart-specific fields when emitted from a non-multipart path
 * (single PUT, external image hosts). -1 means N/A. Documented as part of the
 * ICloudUploaderManager / IFileUploadProgress contract.
 */
const NON_MULTIPART_PARTS_PLACEHOLDER = -1

/**
 * Meta info for an `uploadWithProgress` call. `fileName` is required (consumers use it to
 * disambiguate concurrent uploads); the rest are optional and default to the "non-multipart"
 * placeholders.
 */
export interface IUploadProgressMeta {
  /** The file name currently being uploaded (i.e. IImgInfo.fileName). */
  fileName: string
  /**
   * Total bytes for this upload. Axios usually fills `total` in its progress event, but some
   * transports (notably SDK-wrapped requests) don't — in that case the helper falls back to
   * meta.totalBytes. If neither is available, emitted payloads use total = 0, fraction = 0.
   */
  totalBytes?: number
  /** Multipart-only: whether this upload is a resumed session. Defaults to false. */
  resumed?: boolean
  /** Multipart-only: number of parts already completed. Defaults to -1 (N/A). */
  partsCompleted?: number
  /** Multipart-only: total part count. Defaults to -1 (N/A). */
  totalParts?: number
}

type SupportedConfig = AxiosRequestConfig | IOldReqOptions

/**
 * Thin wrapper around `ctx.request` that injects axios's `onUploadProgress` hook and emits
 * `IBuildInEvent.FILE_UPLOAD_PROGRESS` events as bytes flow out. Pass-through return type
 * matches `ctx.request` exactly.
 *
 * Intent: establish a single convention for "emit progress while uploading" — built-in uploaders
 * and external plugins can drop in a one-line replacement:
 *   `await ctx.request(opts)` → `await uploadWithProgress(ctx, opts, { fileName })`.
 *
 * Multipart's state machine does NOT use this helper. Per-part progress is emitted directly
 * from the runner so it can include multipart-only fields (partsCompleted, resumed). This
 * helper serves the simpler "one PUT/POST = one file" case.
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

  // ctx.request's generic signature is intentionally heavy (it has to back-compat old + new option
  // shapes). Going through IResponse here gives us the call-site return type without re-deriving it.
  return ctx.request<T, SupportedConfig>(augmented) as unknown as Promise<T> & Promise<IResponse<T, SupportedConfig>>
}
