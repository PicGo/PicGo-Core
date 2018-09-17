import sizeOf from 'image-size'
import path from 'path'
import fs from 'fs-extra'
import PicGo from '../../core/PicGo'
import { ImgSize } from '../../utils/interfaces'

const handle = async (ctx: PicGo) => {
  let results = ctx.output
  await Promise.all(ctx.input.map(async item => {
    let fileName = path.basename(item)
    let buffer = await fs.readFile(item)
    let base64Image = Buffer.from(buffer).toString('base64')
    let imgSize: ImgSize = sizeOf(item)
    results.push({
      base64Image,
      fileName,
      width: imgSize.width,
      height: imgSize.height,
      extname: path.extname(item)
    })
  }))
  return ctx
}

export default {
  handle
}
