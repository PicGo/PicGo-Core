import PicGo from '../../core/PicGo'
import crypto from 'crypto'
import mime from 'mime-types'
import { IPluginConfig, ITcyunConfig } from '../../types'
import { Options } from 'request-promise-native'
import { IBuildInEvent } from '../../utils/enum'

// generate COS signature string

export interface ISignature {
  signature: string
  appId: string
  bucket: string
  signTime: string
}

const generateSignature = (options: ITcyunConfig, fileName: string): ISignature => {
  const secretId = options.secretId
  const secretKey = options.secretKey
  const appId = options.appId
  const bucket = options.bucket
  let signature
  let signTime: string = ''
  if (!options.version || options.version === 'v4') {
    const random = Math.floor(Math.random() * 10000000000)
    const current = Math.floor(new Date().getTime() / 1000) - 1
    const expired = current + 3600

    const multiSignature = `a=${appId}&b=${bucket}&k=${secretId}&e=${expired}&t=${current}&r=${random}&f=`

    const signHexKey = crypto.createHmac('sha1', secretKey).update(multiSignature).digest()
    const tempString = Buffer.concat([signHexKey, Buffer.from(multiSignature)])
    signature = Buffer.from(tempString).toString('base64')
  } else {
    // https://cloud.tencent.com/document/product/436/7778#signature
    const today = Math.floor(new Date().getTime() / 1000)
    const tomorrow = today + 86400
    signTime = `${today};${tomorrow}`
    const signKey = crypto.createHmac('sha1', secretKey).update(signTime).digest('hex')
    const httpString = `put\n/${options.path}${fileName}\n\nhost=${options.bucket}.cos.${options.area}.myqcloud.com\n`
    const sha1edHttpString = crypto.createHash('sha1').update(httpString).digest('hex')
    const stringToSign = `sha1\n${signTime}\n${sha1edHttpString}\n`
    signature = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex')
  }
  return {
    signature,
    appId,
    bucket,
    signTime
  }
}

const postOptions = (options: ITcyunConfig, fileName: string, signature: ISignature, image: Buffer): Options => {
  const area = options.area
  const path = options.path
  if (!options.version || options.version === 'v4') {
    return {
      method: 'POST',
      url: `http://${area}.file.myqcloud.com/files/v2/${signature.appId}/${signature.bucket}/${encodeURI(path)}${fileName}`,
      headers: {
        Host: `${area}.file.myqcloud.com`,
        Authorization: signature.signature,
        contentType: 'multipart/form-data'
      },
      formData: {
        op: 'upload',
        filecontent: image
      }
    }
  } else {
    return {
      method: 'PUT',
      url: `http://${options.bucket}.cos.${options.area}.myqcloud.com/${encodeURI(path)}${encodeURI(fileName)}`,
      headers: {
        Host: `${options.bucket}.cos.${options.area}.myqcloud.com`,
        Authorization: `q-sign-algorithm=sha1&q-ak=${options.secretId}&q-sign-time=${signature.signTime}&q-key-time=${signature.signTime}&q-header-list=host&q-url-param-list=&q-signature=${signature.signature}`,
        contentType: mime.lookup(fileName)
      },
      body: image,
      resolveWithFullResponse: true
    }
  }
}

const handle = async (ctx: PicGo): Promise<PicGo | boolean> => {
  const tcYunOptions = ctx.getConfig<ITcyunConfig>('picBed.tcyun')
  if (!tcYunOptions) {
    throw new Error('Can\'t find tencent COS config')
  }
  try {
    const imgList = ctx.output
    const customUrl = tcYunOptions.customUrl
    const path = tcYunOptions.path
    const useV4 = !tcYunOptions.version || tcYunOptions.version === 'v4'
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const signature = generateSignature(tcYunOptions, img.fileName)
        if (!signature) {
          return false
        }
        let image = img.buffer
        if (!image && img.base64Image) {
          image = Buffer.from(img.base64Image, 'base64')
        }
        const options = postOptions(tcYunOptions, img.fileName, signature, image)
        const res = await ctx.Request.request(options)
          .then((res: any) => res)
          .catch((err: Error) => {
            ctx.log.error(err)
            return {
              statusCode: 400,
              body: {
                msg: '认证失败！'
              }
            }
          })
        let body
        if (useV4 && typeof res === 'string') {
          body = JSON.parse(res)
        } else {
          body = res
        }
        if (body.statusCode === 400) {
          throw new Error(body.msg || body.message)
        }
        if (useV4 && body.message === 'SUCCESS') {
          delete img.base64Image
          delete img.buffer
          if (customUrl) {
            img.imgUrl = `${customUrl}/${path}${img.fileName}`
          } else {
            img.imgUrl = body.data.source_url
          }
        } else if (!useV4 && body && body.statusCode === 200) {
          delete img.base64Image
          delete img.buffer
          if (customUrl) {
            img.imgUrl = `${customUrl}/${path}${img.fileName}`
          } else {
            img.imgUrl = `https://${tcYunOptions.bucket}.cos.${tcYunOptions.area}.myqcloud.com/${path}${img.fileName}`
          }
        } else {
          throw new Error(res.body.msg)
        }
      }
    }
    return ctx
  } catch (err) {
    if (!tcYunOptions.version || tcYunOptions.version === 'v4') {
      try {
        const body = JSON.parse(err.error)
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: '上传失败',
          body: `错误码：${body.code as string}，请打开浏览器粘贴地址查看相关原因`,
          text: 'https://cloud.tencent.com/document/product/436/8432'
        })
      } catch (e) {}
    }
    throw err
  }
}

const config = (ctx: PicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ITcyunConfig>('picBed.tcyun') || {}
  const config = [
    {
      name: 'secretId',
      type: 'input',
      default: userConfig.secretId || '',
      required: true
    },
    {
      name: 'secretKey',
      type: 'input',
      default: userConfig.secretKey || '',
      required: true
    },
    {
      name: 'bucket',
      type: 'input',
      default: userConfig.bucket || '',
      required: true
    },
    {
      name: 'appId',
      type: 'input',
      default: userConfig.appId || '',
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
      name: 'version',
      type: 'list',
      choices: ['v4', 'v5'],
      default: 'v5',
      required: false
    }
  ]
  return config
}

export default {
  name: '腾讯云COS',
  handle,
  config
}
