import PicGo from '../../core/PicGo'
import { IPluginConfig, IImgurConfig } from '../../utils/interfaces'
import { Options } from 'request-promise-native'

const postOptions = (options: IImgurConfig, fileName: string, imgBase64: string): Options => {
  const clientId = options.clientId
  const obj: Options = {
    method: 'POST',
    url: 'https://api.imgur.com/3/image',
    headers: {
      Authorization: `Client-ID ${clientId}`,
      'content-type': 'multipart/form-data',
      'User-Agent': 'PicGo'
    },
    formData: {
      image: imgBase64,
      type: 'base64',
      name: fileName
    }
  }
  if (options.proxy) {
    obj.proxy = options.proxy
  }
  return obj
}

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const imgurOptions = ctx.getConfig<IImgurConfig>('picBed.imgur')
  if (!imgurOptions) {
    throw new Error('Can\'t find imgur config')
  }
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const base64Image = img.base64Image || Buffer.from(img.buffer).toString('base64')
        const options = postOptions(imgurOptions, img.fileName, base64Image)
        let body = await ctx.Request.request(options)
        body = JSON.parse(body)
        if (body.success) {
          delete img.base64Image
          delete img.buffer
          img.imgUrl = body.data.link
        } else {
          throw new Error('Server error, please try again')
        }
      }
    }
    return ctx
  } catch (err) {
    ctx.emit('notification', {
      title: '上传失败',
      body: '请检查你的配置以及网络',
      text: 'http://docs.imgur.com/api/errno/'
    })
    throw err
  }
}

const config = (ctx: PicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IImgurConfig>('picBed.imgur') || {}
  const config = [
    {
      name: 'clientId',
      type: 'input',
      default: userConfig.clientId || '',
      required: true
    },
    {
      name: 'proxy',
      type: 'input',
      default: userConfig.proxy || '',
      required: false
    }
  ]
  return config
}

export default {
  name: 'Imgur图床',
  handle,
  config
}
