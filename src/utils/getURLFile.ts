import PicGo from '../core/PicGo'
import request from 'request'
import path from 'path'
import { IPathTransformedImgInfo } from './interfaces'

export const getURLFile = async (ctx: PicGo, url: string): Promise<IPathTransformedImgInfo> => {
  const requestOptions = {
    method: 'GET',
    url,
    encoding: null
  }
  let isImage = false
  let extname = ''
  let timeoutId
  // tslint:disable-next-line: typedef
  const requestPromise = new Promise<IPathTransformedImgInfo>(async (resolve): Promise<void> => {
    try {
      const res = await ctx.Request.request(requestOptions)
        .on('response', (response: request.Response): void => {
          const contentType = response.headers['content-type']
          if (contentType.includes('image')) {
            isImage = true
            extname = `.${contentType.split('image/')[1]}`
          }
        })
      clearTimeout(timeoutId)
      if (isImage) {
        resolve({
          buffer: res,
          fileName: path.basename(requestOptions.url.split('?')[0]),
          extname,
          success: true
        })
      } else {
        resolve({
          success: false,
          reason: `${url} is not image`
        })
      }
    } catch {
      clearTimeout(timeoutId)
      resolve({
        success: false,
        reason: `request ${url} error`
      })
    }
  })
  // tslint:disable-next-line: typedef
  const timeoutPromise = new Promise<IPathTransformedImgInfo>((resolve): void => {
    timeoutId = setTimeout(() => {
      resolve({
        success: false,
        reason: `request ${url} timeout`
      })
    }, 10000)
  })
  return Promise.race([requestPromise, timeoutPromise])
}
