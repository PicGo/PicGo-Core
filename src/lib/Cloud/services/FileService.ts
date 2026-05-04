import axios from 'axios'
import mime from 'mime-types'
import type { IImgInfo, IPicGo, IReqOptions } from '../../../types'
import type { ILocalesKey } from '../../../i18n/zh-CN'
import { AuthRequestClient, createCloudServiceError, getCloudErrorMessage, getCloudErrorStatus } from '../Request'

interface IPresignResponse {
  success: boolean
  objectKey?: string
  publicId?: string
  uploadUrl?: string
  url?: string
  method?: string
  headers?: Record<string, string>
  message?: string
}

interface ICompleteResponseItem {
  id: string
  imgUrl: string
  width?: number
  height?: number
  size?: number
  contentType?: string
  [key: string]: unknown
}

interface ICompleteResponse {
  success: boolean
  data?: {
    item: ICompleteResponseItem
  }
  message?: string
}

export type FileUploadResult = {
  imgUrl: string
  width?: number
  height?: number
  size?: number
  contentType?: string
}

export class FileService {
  private readonly ctx: IPicGo
  private readonly client: AuthRequestClient

  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.client = new AuthRequestClient(ctx)
  }

  async upload (img: IImgInfo): Promise<FileUploadResult> {
    const token = this.getToken()
    const fileName = this.getFileName(img)
    const image = this.getImageBuffer(img)
    const contentType = this.getContentType(img, fileName)
    const presignTime = Date.now()
    const presign = await this.callAuthenticatedStep(async () => {
      return await this.client.request<IPresignResponse>({
        method: 'POST',
        url: '/api/upload/presign',
        data: {
          filename: fileName,
          ...(contentType ? { contentType } : {})
        }
      }, token)
    })

    this.ctx.log.debug('Presign duration', Date.now() - presignTime, 'ms')

    if (!presign.success || !presign.objectKey || !presign.publicId || !presign.uploadUrl) {
      throw new Error(
        presign.message ||
        this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_INVALID_PRESIGN_RESPONSE')
      )
    }

    const uploadHeaders = this.buildUploadHeaders(presign.headers, contentType)
    const uploadStartTime = Date.now()
    await this.ctx.request<void, IReqOptions<Buffer>>({
      method: 'PUT',
      url: presign.uploadUrl,
      data: image,
      headers: uploadHeaders,
      resolveWithFullResponse: true
    })

    this.ctx.log.debug('Upload duration', Date.now() - uploadStartTime, 'ms')

    const finalizeStartTime = Date.now()
    const complete = await this.callAuthenticatedStep(async () => {
      return await this.client.request<ICompleteResponse>({
        method: 'POST',
        url: '/api/album-items/complete',
        data: {
          objectKey: presign.objectKey,
          publicId: presign.publicId,
          filename: fileName,
          ...(typeof img.width === 'number' ? { width: img.width } : {}),
          ...(typeof img.height === 'number' ? { height: img.height } : {})
        }
      }, token)
    })
    const completeTime = Date.now()
    this.ctx.log.debug('Complete duration', completeTime - finalizeStartTime, 'ms')
    this.ctx.log.debug('All duration', completeTime - presignTime, 'ms')

    const completeItem = complete.data?.item
    const finalUrl = completeItem?.imgUrl
    if (!complete.success || typeof finalUrl !== 'string' || finalUrl.length === 0) {
      throw new Error(
        complete.message ||
        this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_INVALID_COMPLETE_RESPONSE')
      )
    }

    return {
      imgUrl: finalUrl,
      ...(typeof completeItem?.width === 'number' ? { width: completeItem.width } : {}),
      ...(typeof completeItem?.height === 'number' ? { height: completeItem.height } : {}),
      ...(typeof completeItem?.size === 'number' ? { size: completeItem.size } : {}),
      ...(typeof completeItem?.contentType === 'string' ? { contentType: completeItem.contentType } : {})
    }
  }

  private getToken (): string {
    const token = this.ctx.getConfig<string | undefined>('settings.picgoCloud.token')?.trim()
    if (!token) {
      throw new Error(this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_LOGIN_REQUIRED'))
    }
    return token
  }

  private getFileName (img: IImgInfo): string {
    const fileName = img.fileName?.trim()
    if (!fileName) {
      throw new Error(this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MISSING_FILE_NAME'))
    }
    return fileName
  }

  private getImageBuffer (img: IImgInfo): Buffer {
    if (img.buffer) {
      return img.buffer
    }

    if (img.base64Image) {
      return Buffer.from(img.base64Image, 'base64')
    }

    throw new Error(this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_MISSING_FILE_DATA'))
  }

  private getContentType (img: IImgInfo, fileName: string): string | undefined {
    const explicitMimeType = img.contentType?.trim() || img.mimeType?.trim()
    if (explicitMimeType) {
      return explicitMimeType
    }

    const inferredMimeType = mime.lookup(fileName)
    return typeof inferredMimeType === 'string' ? inferredMimeType : undefined
  }

  private buildUploadHeaders (headers?: Record<string, string>, contentType?: string): Record<string, string> {
    const finalHeaders = { ...(headers || {}) }
    if (!contentType) {
      return finalHeaders
    }

    const hasContentType = Object.keys(finalHeaders).some(key => key.toLowerCase() === 'content-type')
    if (!hasContentType) {
      finalHeaders['Content-Type'] = contentType
    }

    return finalHeaders
  }

  private async callAuthenticatedStep<T> (handler: () => Promise<T>): Promise<T> {
    try {
      return await handler()
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = getCloudErrorStatus(error)
        if (status === 401) {
          this.ctx.removeConfig('settings.picgoCloud', 'token')
          throw createCloudServiceError(
            this.ctx.i18n.translate<ILocalesKey>('PICGO_CLOUD_UPLOAD_RELOGIN_REQUIRED'),
            error
          )
        }

        const message = getCloudErrorMessage(error)
        if (message.trim() !== '') {
          throw createCloudServiceError(message, error)
        }
      }

      throw error
    }
  }
}
