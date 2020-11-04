import request from 'request'
import requestPromise from 'request-promise-native'
import fs from 'fs-extra'
import path from 'path'
import { imageSize } from 'image-size'
import {
  IImgSize,
  IPathTransformedImgInfo
} from './interfaces'
import { URL } from 'url'

export const isUrl = (url: string): boolean => (url.startsWith('http://') || url.startsWith('https://'))
export const isUrlEncode = (url: string): boolean => {
  url = url || ''
  try {
    return url !== decodeURI(url)
  } catch (e) {
    // if some error caught, try to let it go
    return true
  }
}
export const handleUrlEncode = (url: string): string => {
  if (!isUrlEncode(url)) {
    url = encodeURI(url)
  }
  return url
}

export const getImageSize = (file: Buffer): IImgSize => {
  try {
    const { width = 0, height = 0 } = imageSize(file)
    return {
      real: true,
      width,
      height
    }
  } catch (e) {
    // fallback to 200 * 200
    return {
      real: false,
      width: 200,
      height: 200
    }
  }
}

export const getFSFile = async (filePath: string): Promise<IPathTransformedImgInfo> => {
  try {
    return {
      extname: path.extname(filePath),
      fileName: path.basename(filePath),
      buffer: await fs.readFile(filePath),
      success: true
    }
  } catch {
    return {
      reason: `read file ${filePath} error`,
      success: false
    }
  }
}

export const getURLFile = async (url: string): Promise<IPathTransformedImgInfo> => {
  const requestOptions = {
    method: 'GET',
    url: handleUrlEncode(url),
    encoding: null
  }
  let isImage = false
  let extname = ''
  let timeoutId
  // tslint:disable-next-line: typedef
  const requestFn = new Promise<IPathTransformedImgInfo>((resolve, reject) => {
    (async () => {
      try {
        const res = await requestPromise(requestOptions)
          .on('response', (response: request.Response): void => {
            const contentType = response.headers['content-type']
            if (contentType?.includes('image')) {
              isImage = true
              extname = `.${contentType.split('image/')[1]}`
            }
          })
        clearTimeout(timeoutId)
        if (isImage) {
          const urlPath = new URL(requestOptions.url).pathname
          resolve({
            buffer: res,
            fileName: path.basename(urlPath),
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
    })().catch(reject)
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
  return Promise.race([requestFn, timeoutPromise])
}
