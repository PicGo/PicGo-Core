import PicGo from '../../core/PicGo'
import ImgFromPath from './path'
import ImgFromBase64 from './base64'

export default (ctx: PicGo) => {
  ctx.helper.transformer.register('path', ImgFromPath)
  ctx.helper.transformer.register('base64', ImgFromBase64)
}
