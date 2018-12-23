import PicGo from '../../core/PicGo'
import { PluginConfig } from '../../utils/interfaces'

const postOptions = (options: any, fileName: string, imgBase64: string): any => {
  const clientId = options.clientId
  let obj = {
    method: 'POST',
    url: `https://api.imgur.com/3/image`,
    headers: {
      Authorization: 'Client-ID ' + clientId,
      'content-type': 'multipart/form-data',
      'User-Agent': 'PicGo'
    },
    formData: {
      image: imgBase64,
      type: 'base64',
      name: fileName
    }
  }
  return obj
}

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const imgurOptions = ctx.getConfig('picBed.imgur')
  if (!imgurOptions) {
    throw new Error('Can\'t find imgur config')
  }
  try {
    const imgList = ctx.output
    for (let i in imgList) {
      let base64Image = imgList[i].base64Image || Buffer.from(imgList[i].buffer).toString('base64')
      const options = postOptions(imgurOptions, imgList[i].fileName, base64Image)
      let body = await ctx.Request.request(options)
      body = JSON.parse(body)
      if (body.success) {
        delete imgList[i].base64Image
        delete imgList[i].buffer
        imgList[i]['imgUrl'] = `${body.data.link}`
      } else {
        throw new Error('Server error, please try again')
      }
    }
    return ctx
  } catch (err) {
    ctx.emit('notification', {
      title: '上传失败！',
      body: '请检查你的配置以及网络！',
      text: 'http://docs.imgur.com/api/errno/'
    })
    throw err
  }
}

const config = (ctx: PicGo): PluginConfig[] => {
  let userConfig = ctx.getConfig('picBed.imgur')
  if (!userConfig) {
    userConfig = {}
  }
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
