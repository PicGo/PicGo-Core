import PicGo from '../../core/PicGo'
import request from 'request-promise-native'
import { PluginConfig } from '../../utils/interfaces'
const j = request.jar()
const rp = request.defaults({ jar: j })
const UPLOAD_URL = 'http://picupload.service.weibo.com/interface/pic_upload.php?ori=1&mime=image%2Fjpeg&data=base64&url=0&markpos=1&logo=&nick=0&marks=1&app=miniblog'

const postOptions = (formData) => {
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

const handle = async (ctx: PicGo) => {
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
      res = await rp(options)
    }
    if (chooseCookie || res.body.retcode === 20000000) {
      if (res) {
        for (let i in res.body.data.crossdomainlist) {
          await rp.get(res.body.data.crossdomainlist[i])
        }
      }
      const imgList = ctx.output
      for (let i in imgList) {
        let opt = {
          formData: {
            b64_data: imgList[i].base64Image
          }
        }
        if (chooseCookie) {
          opt['headers'] = {
            Cookie: cookie
          }
        }
        let result = await rp.post(UPLOAD_URL, opt)
        result = result.replace(/<.*?\/>/, '').replace(/<(\w+).*?>.*?<\/\1>/, '')
        delete imgList[i].base64Image
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
          imgList[i]['type'] = 'weibo'
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
      when (answer): boolean {
        return !answer.chooseCookie
      },
      required: false
    },
    {
      name: 'password',
      type: 'password',
      default: userConfig.password || '',
      when (answer): boolean {
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
      when (answer): boolean {
        return answer.chooseCookie
      },
      required: false
    }
  ]
  return config
}

const handleConfig = async (ctx: PicGo) => {
  const prompts = config(ctx)
  const answer = await ctx.cmd.inquirer.prompt(prompts)
  ctx.saveConfig({
    'picBed.weibo': answer
  })
}

export default {
  name: '微博图床',
  handle,
  handleConfig,
  config
}
