import {
  isUrl,
  getImageSize,
  getFSFile,
  getURLFile
} from '../../utils/common'
import { IPicGo, IPathTransformedImgInfo, IImgInfo, IImgSize } from '../../types'

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const results: IImgInfo[] = ctx.output
  await Promise.all(ctx.input.map(async (item: string, index: number) => {
    let info: IPathTransformedImgInfo
    if (isUrl(item)) {
      info = await getURLFile(item, ctx)
    } else {
      info = await getFSFile(item)
    }
    if (info.success && info.buffer) {
      const imgSize = getImgSize(ctx, info.buffer, item)
      results[index] = {
        buffer: info.buffer,
        fileName: info.fileName,
        width: imgSize.width,
        height: imgSize.height,
        extname: info.extname
      }
    } else {
      throw new Error(info.reason)
    }
  }))
  // remove empty item
  ctx.output = results.filter(item => item)
  return ctx
}

const getImgSize = (ctx: IPicGo, file: Buffer, path: string): IImgSize => {
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
