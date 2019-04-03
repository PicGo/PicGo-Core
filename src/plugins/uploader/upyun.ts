import PicGo from '../../core/PicGo'
import { PluginConfig } from '../../utils/interfaces'
import crypto from 'crypto'
import MD5 from 'md5'

// generate COS signature string
const generateSignature = (options: any, fileName: string): string => {
  const path = options.path || ''
  const operator = options.operator
  const password = options.password
  const md5Password = MD5(password)
  const date = new Date().toUTCString()
  const uri = `/${options.bucket}/${encodeURI(path)}${encodeURI(fileName)}`
  const value = `PUT&${uri}&${date}`
  const sign = crypto.createHmac('sha1', md5Password).update(value).digest('base64')
  return `UPYUN ${operator}:${sign}`
}

const postOptions = (options: any, fileName: string, signature: string, image: Buffer): any => {
  const bucket = options.bucket
  const path = options.path || ''
  return {
    method: 'PUT',
    url: `https://v0.api.upyun.com/${bucket}/${encodeURI(path)}${encodeURI(fileName)}`,
    headers: {
      Authorization: signature,
      Date: new Date().toUTCString()
    },
    body: image,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const upyunOptions = ctx.getConfig('picBed.upyun')
  if (!upyunOptions) {
    throw new Error('Can\'t find upYun config')
  }
  try {
    const imgList = ctx.output
    const path = upyunOptions.path || ''
    for (let i in imgList) {
      let image = imgList[i].buffer
      if (!image && imgList[i].base64Image) {
        image = Buffer.from(imgList[i].base64Image, 'base64')
      }
      const singature = generateSignature(upyunOptions, imgList[i].fileName)
      const options = postOptions(upyunOptions, imgList[i].fileName, singature, image)
      const body = await ctx.Request.request(options)
      if (body.statusCode === 200) {
        delete imgList[i].base64Image
        delete imgList[i].buffer
        imgList[i]['imgUrl'] = `${upyunOptions.url}/${path}${imgList[i].fileName}${upyunOptions.options}`
      } else {
        throw new Error('Upload failed')
      }
    }
    return ctx
  } catch (err) {
    if (err.message === 'Upload failed') {
      ctx.emit('notification', {
        title: '上传失败！',
        body: `请检查你的配置项是否正确`
      })
    } else {
      const body = JSON.parse(err.error)
      ctx.emit('notification', {
        title: '上传失败！',
        body: `错误码：${body.code}，请打开浏览器粘贴地址查看相关原因。`,
        text: 'http://docs.upyun.com/api/errno/'
      })
    }
    throw err
  }
}

const config = (ctx: PicGo): PluginConfig[] => {
  let userConfig = ctx.getConfig('picBed.upyun')
  if (!userConfig) {
    userConfig = {}
  }
  const config = [
    {
      name: 'bucket',
      type: 'input',
      default: userConfig.bucket || '',
      required: true
    },
    {
      name: 'operator',
      type: 'input',
      default: userConfig.operator || '',
      required: true
    },
    {
      name: 'password',
      type: 'password',
      default: userConfig.password || '',
      required: true
    },
    {
      name: 'url',
      type: 'input',
      default: userConfig.url || '',
      required: true
    },
    {
      name: 'options',
      type: 'input',
      default: userConfig.options || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      default: userConfig.path || '',
      required: false
    }
  ]
  return config
}

export default {
  name: '又拍云图床',
  handle,
  config
}
