import { IPicGo, IPicGoPlugin } from '../../types'
import SMMSUploader from './smms'
import tcYunUploader from './tcyun'
import githubUploader from './github'
import qiniuUploader from './qiniu'
import imgurUploader from './imgur'
import aliYunUploader from './aliyun'
import upYunUploader from './upyun'

const buildInUploaders: IPicGoPlugin = () => {
  return {
    register (ctx: IPicGo) {
      aliYunUploader(ctx)
      tcYunUploader(ctx)
      SMMSUploader(ctx)
      githubUploader(ctx)
      qiniuUploader(ctx)
      imgurUploader(ctx)
      upYunUploader(ctx)
    }
  }
}

export default buildInUploaders
