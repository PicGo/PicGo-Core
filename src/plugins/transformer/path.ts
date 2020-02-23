import probe from 'probe-image-size'
import path from 'path'
import fs from 'fs-extra'
import PicGo from '../../core/PicGo'
import { getURLFile } from '../../utils/getURLFile'
import { isUrl } from '../../utils/common'
import { IPathTransformedImgInfo, ImgInfo } from '../../utils/interfaces'

const handle = async (ctx: PicGo): Promise<PicGo> => {
  let results: ImgInfo[] = ctx.output
  await Promise.all(ctx.input.map(async (item: string) => {
    let info: IPathTransformedImgInfo
    if (isUrl(item)) {
      info = await getURLFile(ctx, item)
    } else {
      info = await getFSFile(item)
    }
    if (info.success) {
      try {
        const imgSize = probe.sync(info.buffer)
        results.push({
          buffer: info.buffer,
          fileName: info.fileName,
          width: imgSize.width,
          height: imgSize.height,
          extname: path.extname(item)
        })
      } catch (e) {
        ctx.log.error(e)
      }
    } else {
      ctx.log.error(info.reason)
    }
  }))
  return ctx
}

const getFSFile = async (item: string): Promise<IPathTransformedImgInfo> => {
  try {
    return {
      extname: path.extname(item),
      fileName: path.basename(item),
      buffer: await fs.readFile(item),
      success: true
    }
  } catch {
    return {
      reason: `read file ${item} error`,
      success: false
    }
  }
}

export default {
  handle
}
