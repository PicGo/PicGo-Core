import { IPicGo, IPluginConfig, IStarDotsConfig, IOldReqOptionsWithFullResponse } from '../../types'
import { createHash } from 'crypto'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { safeParse } from '../../utils/common'
import FormData from 'form-data'

const makeHeaders = (clientKey: string, clientSecret: string): Record<string, string> => {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = `${Date.now()}${10000 + Math.floor(Math.random() * 10000)}`;
  const needSignStr = `${ts}|${clientSecret}|${nonce}`;

  const instance = createHash('md5');
  instance.update(needSignStr);
  const sign = instance.digest('hex').toUpperCase();

  const extraInfo = JSON.stringify({
    sdk: 'true',
    language: 'typescript',
    version: 'picgo:1.0.0',
    os: process.platform,
    arch: process.arch,
  });

  return {
    'x-stardots-timestamp': ts,
    'x-stardots-nonce': nonce,
    'x-stardots-key': clientKey,
    'x-stardots-sign': sign,
    'x-stardots-extra': extraInfo,
  };
}

const postOptions = (options: IStarDotsConfig, fileName: string, image: Buffer): IOldReqOptionsWithFullResponse => {
  const space = options.space

  // set headers
  let headers = makeHeaders(options.clientKey, options.clientSecret)
  headers['Content-Type'] = 'multipart/form-data'

  // set form data
  let formData = new FormData()
  formData.append('space', space)
  formData.append('file', image, fileName)

  return {
    method: 'PUT',
    url: `https://api.stardots.io/openapi/file/upload`,
    headers: headers,
    body: formData,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const stardotsOptions = ctx.getConfig<IStarDotsConfig>('picBed.stardots')
  if (!stardotsOptions) {
    throw new Error('Can\'t find stardots config')
  }
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        let image = img.buffer
        if (!image && img.base64Image) {
          image = Buffer.from(img.base64Image, 'base64')
        }
        const options = postOptions(stardotsOptions, img.fileName, image)
        const resp = await ctx.request(options)
        const body = JSON.parse(resp.body as string)
        if (resp.statusCode === 200 && body.success === true) {
          delete img.base64Image
          delete img.buffer
          img.imgUrl = body?.data?.url
        } else {
          ctx.emit(IBuildInEvent.NOTIFICATION, {
            title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
            body: ctx.i18n.translate<ILocalesKey>(('PICBED_STARDOTS_API_CODE_' + body.code) as ILocalesKey)
          })
          throw new Error('Upload failed')
        }
      }
    }
    return ctx
  } catch (err: any) {
    if (err.message === 'Upload failed') {
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS')
      })
    } else {
      const body = safeParse<{ code: string }>(err.error)
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED_REASON', {
          code: typeof body === 'object' ? body.code : body
        }),
        text: 'https://stardots.io/en/documentation/openapi#File%20upload'
      })
    }
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IStarDotsConfig>('picBed.stardots') || {}
  const config: IPluginConfig[] = [
    {
      name: 'clientKey',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_STARDOTS_KEY') },
      default: userConfig.clientKey || '',
      required: true
    },
    {
      name: 'clientSecret',
      type: 'password',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_STARDOTS_SECRET') },
      default: userConfig.clientSecret || '',
      required: true
    },
    {
      name: 'space',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_STARDOTS_SPACE') },
      default: userConfig.space || '',
      required: true
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('stardots', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_STARDOTS') },
    handle,
    config
  })
}
