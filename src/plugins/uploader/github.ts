import { IPicGo, IPluginConfig, IGithubConfig } from '../../types'
import { Options } from 'request-promise-native'
import { IBuildInEvent } from '../../utils/enum'

const postOptions = (fileName: string, options: IGithubConfig, data: any): Options => {
  const path = options.path || ''
  const { token, repo } = options
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${repo}/contents/${encodeURI(path)}${encodeURI(fileName)}`,
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'PicGo'
    },
    body: data,
    json: true
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const githubOptions = ctx.getConfig<IGithubConfig>('picBed.github')
  if (!githubOptions) {
    throw new Error('Can\'t find github config')
  }
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const base64Image = img.base64Image || Buffer.from(img.buffer).toString('base64')
        const data = {
          message: 'Upload by PicGo',
          branch: githubOptions.branch,
          content: base64Image,
          path: githubOptions.path + encodeURI(img.fileName)
        }
        const postConfig = postOptions(img.fileName, githubOptions, data)
        const body = await ctx.Request.request(postConfig)
        if (body) {
          delete img.base64Image
          delete img.buffer
          if (githubOptions.customUrl) {
            img.imgUrl = `${githubOptions.customUrl}/${githubOptions.path}${img.fileName}`
          } else {
            img.imgUrl = body.content.download_url
          }
        } else {
          throw new Error('Server error, please try again')
        }
      }
    }
    return ctx
  } catch (err) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: '上传失败',
      body: '服务端出错，请重试'
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IGithubConfig>('picBed.github') || {}
  const config = [
    {
      name: 'repo',
      type: 'input',
      default: userConfig.repo || '',
      required: true
    },
    {
      name: 'branch',
      type: 'input',
      default: userConfig.branch || 'master',
      required: true
    },
    {
      name: 'token',
      type: 'input',
      default: userConfig.token || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      default: userConfig.path || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      default: userConfig.customUrl || '',
      required: false
    }
  ]
  return config
}

export default {
  name: 'GitHub图床',
  handle,
  config
}
