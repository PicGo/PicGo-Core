import { IPicGo, IPluginConfig, IImgurConfig } from '../../types'
import { Options } from 'request-promise-native'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'

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

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
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
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK'),
      text: 'http://docs.imgur.com/api/errno/'
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IImgurConfig>('picBed.imgur') || {}
  const config: IPluginConfig[] = [
    {
      name: 'clientId',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_CLIENTID') },
      default: userConfig.clientId || '',
      required: true
    },
    {
      name: 'proxy',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_PROXY') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR_MESSAGE_PROXY') },
      default: userConfig.proxy || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('imgur', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR') },
    handle,
    config
  })
}
