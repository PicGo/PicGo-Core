import PicGo from '../../core/PicGo'
import request from 'request-promise-native'

const postOptions = (fileName: string, imgBase64: string) => {
  return {
    method: 'POST',
    url: `https://sm.ms/api/upload`,
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicGo'
    },
    formData: {
      smfile: {
        value: Buffer.from(imgBase64, 'base64'),
        options: {
          filename: fileName
        }
      },
      ssl: 'true'
    }
  }
}

const handle = async (ctx: PicGo) => {
  const imgList = ctx.output
  for (let i in imgList) {
    const postConfig = postOptions(imgList[i].fileName, imgList[i].base64Image)
    let body = await request(postConfig)
    body = JSON.parse(body)
    if (body.code === 'success') {
      delete imgList[i].base64Image
      imgList[i]['imgUrl'] = body.data.url
    } else {
      throw new Error('Upload failed')
    }
  }
  return ctx
}

export default {
  name: 'SM.MS图床',
  handle
}
