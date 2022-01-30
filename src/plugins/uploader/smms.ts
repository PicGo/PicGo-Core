import { IPicGo, IPluginConfig, ISmmsConfig } from '../../types'
import { Options } from 'request-promise-native'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'

const postOptions = (fileName: string, image: Buffer, apiToken: string): Options => {
  return {
    method: 'POST',
    url: 'https://sm.ms/api/v2/upload',
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicGo',
      Authorization: apiToken
    },
    formData: {
      smfile: {
        value: image,
        options: {
          filename: fileName
        }
      },
      ssl: 'true'
    }
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const smmsConfig = ctx.getConfig<ISmmsConfig>('picBed.smms')
  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      let image = img.buffer
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      const postConfig = postOptions(img.fileName, image, smmsConfig?.token)
      let body = await ctx.Request.request(postConfig)
      body = JSON.parse(body)
      if (body.code === 'success') {
        delete img.base64Image
        delete img.buffer
        img.imgUrl = body.data.url
      } else if (body.code === 'image_repeated' && typeof body.images === 'string') { // do extra check since this error return is not documented at https://doc.sm.ms/#api-Image-Upload
        delete img.base64Image
        delete img.buffer
        img.imgUrl = body.images
      } else {
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: body.message
        })
        throw new Error(body.message)
      }
    }
  }
  return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ISmmsConfig>('picBed.smms') || {}
  const config: IPluginConfig[] = [
    {
      name: 'token',
      message: 'api token',
      type: 'input',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_TOKEN'),
      default: userConfig.token || '',
      required: true
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('smms', {
    name: ctx.i18n.translate<ILocalesKey>('PICBED_SMMS'),
    handle,
    config
  })
}
