import { IPicGo, IPluginConfig, IGithubConfig, IOldReqOptionsWithJSON } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import mime from 'mime-types'

const postOptions = (fileName: string, options: IGithubConfig, data: any): IOldReqOptionsWithJSON => {
  const path = options.path || ''
  const { token, repo } = options
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${repo}/contents/${encodeURI(path)}${encodeURIComponent(fileName)}`,
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'PicGo',
      'Content-Type': mime.lookup(fileName)
    },
    body: data,
    json: true
  } as const
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
        try {
          const body: {
            content: {
              download_url: string
            }
          } = await ctx.request(postConfig)
          if (body) {
            delete img.base64Image
            delete img.buffer
            if (githubOptions.customUrl) {
              img.imgUrl = `${githubOptions.customUrl}/${encodeURI(githubOptions.path)}${encodeURIComponent(img.fileName)}`
            } else {
              img.imgUrl = body.content.download_url
            }
          } else {
            throw new Error('Server error, please try again')
          }
        } catch (e: any) {
          // handle duplicate images
          if (e.statusCode === 422) {
            delete img.base64Image
            delete img.buffer
            if (githubOptions.customUrl) {
              img.imgUrl = `${githubOptions.customUrl}/${encodeURI(githubOptions.path)}${encodeURIComponent(img.fileName)}`
            } else {
              img.imgUrl = `https://raw.githubusercontent.com/${githubOptions.repo}/${githubOptions.branch}/${encodeURI(githubOptions.path)}${encodeURIComponent(img.fileName)}`
            }
          } else {
            throw e
          }
        }
      }
    }
    return ctx
  } catch (err) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK')
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IGithubConfig>('picBed.github') || {}
  const config: IPluginConfig[] = [
    {
      name: 'repo',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_REPO') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_REPO') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_REPO') },
      default: userConfig.repo || '',
      required: true
    },
    {
      name: 'branch',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_BRANCH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_BRANCH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_BRANCH') },
      default: userConfig.branch || 'master',
      required: true
    },
    {
      name: 'token',
      type: 'password',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_TOKEN') },
      default: userConfig.token || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_PATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_PATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_PATH') },
      default: userConfig.path || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_CUSTOMURL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_CUSTOMURL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB_MESSAGE_CUSTOMURL') },
      default: userConfig.customUrl || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('github', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB') },
    handle,
    config
  })
}
