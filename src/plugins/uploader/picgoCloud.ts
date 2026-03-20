import type { ILocalesKey } from '../../i18n/zh-CN'
import type { IPluginConfig, IPicGo } from '../../types'
import { FileService } from '../../lib/Cloud/services/FileService'

const config = (): IPluginConfig[] => []

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const fileService = new FileService(ctx)

  for (const img of ctx.output) {
    try {
      const imgUrl = await fileService.upload(img)
      delete img.base64Image
      delete img.buffer
      img.imgUrl = imgUrl
    } catch (error: unknown) {
      if (error instanceof Error) {
        ctx.log.error(error)
        throw error
      }

      throw new Error(ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'))
    }
  }

  return ctx
}

function registerPicGoCloudUploader (ctx: IPicGo): void {
  ctx.helper.uploader.register('picgoCloud', {
    name: 'PicGo Cloud',
    handle,
    config
  })
}

export { registerPicGoCloudUploader }
