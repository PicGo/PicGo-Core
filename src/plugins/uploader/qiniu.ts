import qiniu from 'qiniu'
import { IPluginConfig, IQiniuConfig, IPicGo, IOldReqOptions } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import mime from 'mime-types'

function postOptions (options: IQiniuConfig, fileName: string, token: string, imgBase64: string): IOldReqOptions {
  const area = selectArea(options.area || 'z0')
  const path = options.path || ''
  const base64FileName = Buffer.from(path + fileName, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  return {
    method: 'POST',
    url: `http://upload${area}.qiniup.com/putb64/-1/key/${base64FileName}`,
    headers: {
      Authorization: `UpToken ${token}`,
      'Content-Type': mime.lookup(fileName) || 'application/octet-stream'
    },
    body: imgBase64
  }
}

function selectArea (area: string): string {
  return area === 'z0' ? '' : '-' + area
}

function getToken (qiniuOptions: any): string {
  const accessKey = qiniuOptions.accessKey
  const secretKey = qiniuOptions.secretKey
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
  const options = {
    scope: qiniuOptions.bucket
  }
  const putPolicy = new qiniu.rs.PutPolicy(options)
  return putPolicy.uploadToken(mac)
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const qiniuOptions = ctx.getConfig<IQiniuConfig>('picBed.qiniu')
  if (!qiniuOptions) {
    throw new Error('Can\'t find qiniu config')
  }
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const base64Image = img.base64Image || Buffer.from(img.buffer).toString('base64')
        const options = postOptions(qiniuOptions, img.fileName, getToken(qiniuOptions), base64Image)
        const res = await ctx.request(options)
        const body = JSON.parse(res)
        if (body?.key) {
          delete img.base64Image
          delete img.buffer
          const baseUrl = qiniuOptions.url
          const options = qiniuOptions.options
          img.imgUrl = `${baseUrl}/${body.key as string}${options}`
        } else {
          ctx.emit(IBuildInEvent.NOTIFICATION, {
            title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
            body: body.msg
          })
          ctx.log.error('qiniu error', body)
          throw new Error('Upload failed')
        }
      }
    }
    return ctx
  } catch (err: any) {
    if (err.message !== 'Upload failed') {
      // err.response maybe undefined
      if (err.response) {
        const error = err.response.body
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: error.error
        })
      }
    }
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IQiniuConfig>('picBed.qiniu') || {}
  const config: IPluginConfig[] = [
    {
      name: 'accessKey',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_ACCESSKEY') },
      default: userConfig.accessKey || '',
      required: true
    },
    {
      name: 'secretKey',
      type: 'password',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_SECRETKEY') },
      default: userConfig.secretKey || '',
      required: true
    },
    {
      name: 'bucket',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_BUCKET') },
      default: userConfig.bucket || '',
      required: true
    },
    {
      name: 'url',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_URL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_URL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_MESSAGE_URL') },
      default: userConfig.url || '',
      required: true
    },
    {
      name: 'area',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_AREA') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_AREA') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_MESSAGE_AREA') },
      default: userConfig.area || '',
      required: true
    },
    {
      name: 'options',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_OPTIONS') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_OPTIONS') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_MESSAGE_OPTIONS') },
      default: userConfig.options || '',
      required: false
    },
    {
      name: 'path',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_PATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_PATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU_MESSAGE_PATH') },
      default: userConfig.path || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('qiniu', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU') },
    handle,
    config
  })
}
