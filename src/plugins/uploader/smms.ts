import PicGo from '../../core/PicGo'
import { PluginConfig } from '../../utils/interfaces'

const postOptions = (fileName: string, image: Buffer, apiToken: string): any => {
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
  const smmsConfig = ctx.getConfig('picBed.smms.token')
  if (!smmsConfig) {
    throw new Error('Can\'t find smms config, please provide api token, see https://sm.ms/home/apitoken')
  }
  const imgList = ctx.output
  for (let i in imgList) {
    let image = imgList[i].buffer
    if (!image && imgList[i].base64Image) {
      image = Buffer.from(imgList[i].base64Image, 'base64')
    }
    const postConfig = postOptions(imgList[i].fileName, image, smmsConfig)
    let body = await ctx.Request.request(postConfig)
    body = JSON.parse(body)
    if (body.code === 'success') {
      delete imgList[i].base64Image
      delete imgList[i].buffer
      imgList[i]['imgUrl'] = body.data.url
    } else if (body.code === 'image_repeated' && typeof body.images === 'string') { // do extra check since this error return is not documented at https://doc.sm.ms/#api-Image-Upload
      delete imgList[i].base64Image
      delete imgList[i].buffer
      imgList[i]['imgUrl'] = body.images
    } else {
      ctx.emit('notification', {
        title: '上传失败',
        body: body.message
      })
      throw new Error(body.message)
    }
  }
  return ctx
}

const config = (ctx: PicGo): PluginConfig[] => {
  let userConfig = ctx.getConfig('picBed.smms')
  if (!userConfig || typeof userConfig !== 'object') {
    userConfig = {}
  }
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
