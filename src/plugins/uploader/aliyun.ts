import PicGo from '../../core/PicGo'
import { PluginConfig } from '../../utils/interfaces'
import crypto from 'crypto'
import mime from 'mime-types'

// generate OSS signature
const generateSignature = (options: any, fileName: string): string => {
  const date = new Date().toUTCString()
  const signString = `PUT\n\n${mime.lookup(fileName)}\n${date}\n/${options.bucket}/${options.path}${fileName}`

  const signature = crypto.createHmac('sha1', options.accessKeySecret).update(signString).digest('base64')
  return `OSS ${options.accessKeyId}:${signature}`
}

const postOptions = (options: any, fileName: string, signature: string, image: Buffer): any => {
  return {
    method: 'PUT',
    url: `https://${options.bucket}.${options.area}.aliyuncs.com/${encodeURI(options.path)}${encodeURI(fileName)}`,
    headers: {
      Host: `${options.bucket}.${options.area}.aliyuncs.com`,
      Authorization: signature,
      Date: new Date().toUTCString(),
      'content-type': mime.lookup(fileName)
    },
    body: image,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const aliYunOptions = ctx.getConfig('picBed.aliyun')
  if (!aliYunOptions) {
    throw new Error('Can\'t find aliYun OSS config')
  }
  try {
    const imgList = ctx.output
    const customUrl = aliYunOptions.customUrl
    const path = aliYunOptions.path
    for (let i in imgList) {
      const signature = generateSignature(aliYunOptions, imgList[i].fileName)
      let image = imgList[i].buffer
      if (!image && imgList[i].base64Image) {
        image = Buffer.from(imgList[i].base64Image, 'base64')
      }
      const options = postOptions(aliYunOptions, imgList[i].fileName, signature, image)
      let body = await ctx.Request.request(options)
      if (body.statusCode === 200) {
        delete imgList[i].base64Image
        delete imgList[i].buffer
        const optionUrl = aliYunOptions.options || ''
        if (customUrl) {
          imgList[i]['imgUrl'] = `${customUrl}/${path}${imgList[i].fileName}${optionUrl}`
        } else {
          imgList[i]['imgUrl'] = `https://${aliYunOptions.bucket}.${aliYunOptions.area}.aliyuncs.com/${path}${imgList[i].fileName}${optionUrl}`
        }
      } else {
        throw new Error('Upload failed')
      }
    }
    return ctx
  } catch (err) {
    ctx.emit('notification', {
      title: '上传失败',
      body: '请检查你的配置项是否正确'
    })
    throw err
  }
}

const config = (ctx: PicGo): PluginConfig[] => {
  let userConfig = ctx.getConfig('picBed.aliyun')
  if (!userConfig) {
    userConfig = {}
  }
  const config = [
    {
      name: 'accessKeyId',
      type: 'input',
      default: userConfig.accessKeyId || '',
      required: true
    },
    {
      name: 'accessKeySecret',
      type: 'input',
      default: userConfig.accessKeySecret || '',
      required: true
    },
    {
      name: 'bucket',
      type: 'input',
      default: userConfig.bucket || '',
      required: true
    },
    {
      name: 'area',
      type: 'input',
      default: userConfig.area || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      default: userConfig.path || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      default: userConfig.customUrl || '',
      required: false
    },
    {
      name: 'options',
      type: 'input',
      default: userConfig.options || '',
      required: false
    }
  ]
  return config
}

export default {
  name: '阿里云OSS',
  handle,
  config
}
