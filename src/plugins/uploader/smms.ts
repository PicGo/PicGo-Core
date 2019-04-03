import PicGo from '../../core/PicGo'

const postOptions = (fileName: string, image: Buffer): any => {
  return {
    method: 'POST',
    url: `https://sm.ms/api/upload`,
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicGo'
    },
    formData: {
      smfile: {
        value: image,
        options: {
          filename: fileName
        }
      },
      ssl: 'true'
    }
  }
}

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const imgList = ctx.output
  for (let i in imgList) {
    let image = imgList[i].buffer
    if (!image && imgList[i].base64Image) {
      image = Buffer.from(imgList[i].base64Image, 'base64')
    }
    const postConfig = postOptions(imgList[i].fileName, image)
    let body = await ctx.Request.request(postConfig)
    body = JSON.parse(body)
    if (body.code === 'success') {
      delete imgList[i].base64Image
      delete imgList[i].buffer
      imgList[i]['imgUrl'] = body.data.url
    } else {
      ctx.emit('notification', {
        title: '上传失败！',
        body: body
      })
      throw new Error('Upload failed')
    }
  }
  return ctx
}

export default {
  name: 'SM.MS图床',
  handle
}
