import PicGo from '../../core/PicGo'
import { IPluginConfig, ISmmsConfig } from '../../utils/interfaces'
import { Options } from 'request-promise-native'

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

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const smmsConfig = ctx.getConfig<ISmmsConfig>('picBed.smms')
  if (!smmsConfig) {
    throw new Error('Can\'t find smms config, please provide api token, see https://sm.ms/home/apitoken')
  }
  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      let image = img.buffer
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      const postConfig = postOptions(img.fileName, image, smmsConfig.token)
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
        ctx.emit('notification', {
          title: '上传失败',
          body: body.message
        })
        throw new Error(body.message)
      }
    }
  }
  return ctx
}

const config = (ctx: PicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ISmmsConfig>('picBed.smms')
  const config = [
    {
      name: 'token',
      message: 'api token',
      type: 'input',
      default: userConfig.token || '',
      required: true
    }
  ]
  return config
}

export default {
  name: 'SM.MS图床',
  handle,
  config
}
