import ImgFromPath from './path'
import ImgFromBase64 from './base64'
import { IPicGo } from '../../types'

export default (ctx: IPicGo): void => {
  ctx.helper.transformer.register('path', ImgFromPath)
  ctx.helper.transformer.register('base64', ImgFromBase64)
}
