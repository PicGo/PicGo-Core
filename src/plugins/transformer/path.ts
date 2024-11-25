import {
  isUrl,
  getImageSize,
  getFSFile,
  getURLFile
} from '../../utils/common'
import { IPicGo, IPathTransformedImgInfo, IImgInfo, IImgSize } from '../../types'
import dayjs from 'dayjs'

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const results: IImgInfo[] = ctx.output
  await Promise.all(ctx.input.map(async (item: string | Buffer, index: number) => {
    let info: IPathTransformedImgInfo
    if (Buffer.isBuffer(item)) {
      info = {
        success: true,
        buffer: item,
        fileName: '', // will use getImageSize result
        extname: '' // will use getImageSize result
      }
    } else if (isUrl(item)) {
      info = await getURLFile(item, ctx)
    } else {
      info = await getFSFile(item)
    }
    if (info.success && info.buffer) {
      const imgSize = getImgSize(ctx, info.buffer, item)
      const extname = info.extname || imgSize.extname || '.png'
      results[index] = {
        buffer: info.buffer,
        fileName: info.fileName || `${dayjs().format('YYYYMMDDHHmmssSSS')}${extname}}`,
        width: imgSize.width,
        height: imgSize.height,
        extname
      }
    } else {
      ctx.log.error(info.reason)
    }
  }))
  // remove empty item
  ctx.output = results.filter(item => item)
  return ctx
}

const getImgSize = (ctx: IPicGo, file: Buffer, path: string | Buffer): IImgSize => {
  const imageSize = getImageSize(file)
  if (!imageSize.real) {
    if (typeof path === 'string') {
      ctx.log.warn(`can't get ${path}'s image size`)
    } else {
      ctx.log.warn('can\'t get image size')
    }
    ctx.log.warn('fallback to 200 * 200')
  }
  return imageSize
}

export default {
  handle
}
