import PicGo from '../../core/PicGo'
import crypto from 'crypto'
import mime from 'mime-types'
import { PluginConfig } from '../../utils/interfaces'

// generate COS signature string

const generateSignature = (options: any, fileName: string): any => {
  const secretId = options.secretId
  const secretKey = options.secretKey
  const appId = options.appId
  const bucket = options.bucket
  let signature
  let signTime
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

const postOptions = (options: any, fileName: string, signature: any, image: Buffer): any => {
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
  const tcYunOptions = ctx.getConfig('picBed.tcyun')
  if (!tcYunOptions) {
    throw new Error('Can\'t find tencent COS config')
  }
  try {
    const imgList = ctx.output
    const customUrl = tcYunOptions.customUrl
    const path = tcYunOptions.path
    const useV4 = !tcYunOptions.version || tcYunOptions.version === 'v4'
    for (let i in imgList) {
      const signature = generateSignature(tcYunOptions, imgList[i].fileName)
      if (!signature) {
        return false
      }
      let image = imgList[i].buffer
      if (!image && imgList[i].base64Image) {
        image = Buffer.from(imgList[i].base64Image, 'base64')
      }
      const options = postOptions(tcYunOptions, imgList[i].fileName, signature, image)
      const res = await ctx.Request.request(options)
        .then((res: any) => res)
        .catch((err: Error) => {
          console.log(err)
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
        throw new Error('Upload failed')
      }
      if (useV4 && body.message === 'SUCCESS') {
        delete imgList[i].base64Image
        delete imgList[i].buffer
        if (customUrl) {
          imgList[i]['imgUrl'] = `${customUrl}/${path}${imgList[i].fileName}`
        } else {
          imgList[i]['imgUrl'] = body.data.source_url
        }
      } else if (!useV4 && body && body.statusCode === 200) {
        delete imgList[i].base64Image
        delete imgList[i].buffer
        if (customUrl) {
          imgList[i]['imgUrl'] = `${customUrl}/${path}${imgList[i].fileName}`
        } else {
          imgList[i]['imgUrl'] = `https://${tcYunOptions.bucket}.cos.${tcYunOptions.area}.myqcloud.com/${path}${imgList[i].fileName}`
        }
      } else {
        ctx.emit('notification', {
          title: '上传失败',
          body: res.body.msg
        })
        throw new Error('Upload failed')
      }
    }
    return ctx
  } catch (err) {
    if (err.message !== 'Upload failed') {
      let body
      if (!tcYunOptions.version || tcYunOptions.version === 'v4') {
        body = JSON.parse(err.error)
        ctx.emit('notification', {
          title: '上传失败',
          body: `错误码：${body.code}，请打开浏览器粘贴地址查看相关原因`,
          text: 'https://cloud.tencent.com/document/product/436/8432'
        })
      }
    } else {
      ctx.emit('notification', {
        title: '上传失败',
        body: `请检查你的配置项是否正确`
      })
    }
    throw err
  }
}

const config = (ctx: PicGo): PluginConfig[] => {
  let userConfig = ctx.getConfig('picBed.tcyun')
  if (!userConfig) {
    userConfig = {}
  }
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
