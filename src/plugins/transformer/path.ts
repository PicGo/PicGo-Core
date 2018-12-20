import probe from 'probe-image-size'
import path from 'path'
import fs from 'fs-extra'
import PicGo from '../../core/PicGo'

const handle = async (ctx: PicGo): Promise<PicGo> => {
  let results = ctx.output
  await Promise.all(ctx.input.map(async (item: string) => {
    let fileName = path.basename(item)
    let buffer = await fs.readFile(item)
    // let base64Image = Buffer.from(buffer).toString('base64')
    let imgSize = probe.sync(buffer)
    results.push({
      buffer,
      // base64Image,
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
