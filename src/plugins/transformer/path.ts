import PicGo from '../../core/PicGo'
import {
  isUrl,
  getImageSize,
  getFSFile,
  getURLFile
} from '../../utils/common'
import { IPathTransformedImgInfo, IImgInfo, IImgSize } from '../../utils/interfaces'

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const results: IImgInfo[] = ctx.output
  await Promise.all(ctx.input.map(async (item: string, index: number) => {
    let info: IPathTransformedImgInfo
    if (isUrl(item)) {
      info = await getURLFile(item)
    } else {
      info = await getFSFile(item)
    }
    if (info.success && info.buffer) {
      try {
        const imgSize = getImgSize(ctx, info.buffer, item)
        results[index] = {
          buffer: info.buffer,
          fileName: info.fileName,
          width: imgSize.width,
          height: imgSize.height,
          extname: info.extname
        }
      } catch (e) {
        ctx.log.error(e)
      }
    } else {
      ctx.log.error(info.reason)
    }
  }))
  // remove empty item
  ctx.output = results.filter(item => item)
  return ctx
}

const getImgSize = (ctx: PicGo, file: Buffer, path: string): IImgSize => {
  const imageSize = getImageSize(file)
  if (!imageSize.real) {
    ctx.log.warn(`can't get ${path}'s image size`)
    ctx.log.warn('fallback to 200 * 200')
  }
  return imageSize
}

export default {
  handle
}
