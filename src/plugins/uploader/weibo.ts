import PicGo from '../../core/PicGo'
import { PluginConfig } from '../../utils/interfaces'
const UPLOAD_URL = 'http://picupload.service.weibo.com/interface/pic_upload.php?ori=1&mime=image%2Fjpeg&data=base64&url=0&markpos=1&logo=&nick=0&marks=1&app=miniblog'

const postOptions = (formData: any): any => {
  return {
    method: 'POST',
    url: 'https://passport.weibo.cn/sso/login',
    headers: {
      Referer: 'https://passport.weibo.cn/signin/login',
      contentType: 'application/x-www-form-urlencoded'
    },
    formData,
    json: true,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx: PicGo): Promise<PicGo> => {
  const weiboOptions = ctx.getConfig('picBed.weibo')
  if (!weiboOptions) {
    throw new Error('Can\'t find weibo config')
  }
  try {
    const formData = {
      username: weiboOptions.username,
      password: weiboOptions.password
    }
    const quality = weiboOptions.quality
    const cookie = weiboOptions.cookie
    const chooseCookie = weiboOptions.chooseCookie
    const options = postOptions(formData)
    let res
    if (!chooseCookie) {
      res = await ctx.Request.request(options)
    }
    if (chooseCookie || res.body.retcode === 20000000) {
      if (res) {
        for (let i in res.body.data.crossdomainlist) {
          await ctx.Request.request.get(res.body.data.crossdomainlist[i])
        }
      }
      const imgList = ctx.output
      for (let i in imgList) {
        let base64Image = imgList[i].base64Image || Buffer.from(imgList[i].buffer).toString('base64')
        let opt = {
          formData: {
            b64_data: base64Image
          }
        }
        if (chooseCookie) {
          opt['headers'] = {
            Cookie: cookie
          }
        }
        let result = await ctx.Request.request.post(UPLOAD_URL, opt)
        result = result.replace(/<.*?\/>/, '').replace(/<(\w+).*?>.*?<\/\1>/, '')
        delete imgList[i].base64Image
        delete imgList[i].buffer
        const resTextJson = JSON.parse(result)
        if (resTextJson.data.pics.pic_1.pid === undefined) {
          ctx.emit('notification', {
            title: '上传失败！',
            body: '微博Cookie失效，请在网页版重新登录一遍'
          })
          throw new Error('Cookie is unavailable')
        } else {
          const extname = imgList[i].extname === '.gif' ? '.gif' : '.jpg'
          imgList[i]['imgUrl'] = `https://ws1.sinaimg.cn/${quality}/${resTextJson.data.pics.pic_1.pid}${extname}`
        }
        delete imgList[i].extname
      }
      return ctx
    } else {
      ctx.emit('notification', {
        title: '上传失败！',
        body: res.body.msg
      })
      throw new Error('Upload failed')
    }
  } catch (err) {
    if (err.error !== 'Upload failed' && err.error !== 'Cookie is unavailable') {
      ctx.emit('notification', {
        title: '上传失败！',
        body: '服务端出错，请重试'
      })
    }
    throw err
  }
}

const config = (ctx: PicGo): PluginConfig[] => {
  let userConfig = ctx.getConfig('picBed.weibo')
  if (!userConfig) {
    userConfig = {}
  }
  const config = [
    {
      name: 'chooseCookie',
      type: 'confirm',
      default: userConfig.chooseCookie || true,
      required: true
    },
    {
      name: 'username',
      type: 'input',
      default: userConfig.username || '',
      when (answer: any): boolean {
        return !answer.chooseCookie
      },
      required: false
    },
    {
      name: 'password',
      type: 'password',
      default: userConfig.password || '',
      when (answer: any): boolean {
        return !answer.chooseCookie
      },
      required: false
    },
    {
      name: 'quality',
      type: 'list',
      choices: ['thumbnail', 'mw690', 'large'],
      default: 'large',
      required: true
    },
    {
      name: 'cookie',
      type: 'input',
      default: userConfig.cookie || '',
      when (answer: any): boolean {
        return answer.chooseCookie
      },
      required: false
    }
  ]
  return config
}

export default {
  name: '微博图床',
  handle,
  config
}
