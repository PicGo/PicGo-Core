import { EventEmitter } from 'events'
import PicGo from './PicGo'
import { IPlugin, Undefinable } from 'src/types'
import { handleUrlEncode } from '../utils/common'
import LifecyclePlugins from '../lib/LifecyclePlugins'

class Lifecycle extends EventEmitter {
  ctx: PicGo

  constructor (ctx: PicGo) {
    super()
    this.ctx = ctx
  }

  async start (input: any[]): Promise<PicGo> {
    try {
      // images input
      if (!Array.isArray(input)) {
        throw new Error('Input must be an array.')
      }
      this.ctx.input = input
      this.ctx.output = []

      // lifecycle main
      await this.beforeTransform()
      await this.doTransform()
      await this.beforeUpload()
      await this.doUpload()
      await this.afterUpload()
      return this.ctx
    } catch (e) {
      this.ctx.log.warn('failed')
      this.ctx.emit('uploadProgress', -1)
      this.ctx.emit('failed', e)
      this.ctx.log.error(e)
      if (this.ctx.getConfig<Undefinable<string>>('debug')) {
        throw e
      }
      return this.ctx
    }
  }

  private async beforeTransform (): Promise<PicGo> {
    this.ctx.emit('uploadProgress', 0)
    this.ctx.emit('beforeTransform', this.ctx)
    this.ctx.log.info('Before transform')
    await this.handlePlugins(this.ctx.helper.beforeTransformPlugins)
    return this.ctx
  }

  private async doTransform (): Promise<PicGo> {
    this.ctx.emit('uploadProgress', 30)
    this.ctx.log.info('Transforming...')
    const type = this.ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path'
    let transformer = this.ctx.helper.transformer.get(type)
    if (!transformer) {
      transformer = this.ctx.helper.transformer.get('path')
      this.ctx.log.warn(`Can't find transformer - ${type}, switch to default transformer - path`)
    }
    await transformer?.handle(this.ctx)
    return this.ctx
  }

  private async beforeUpload (): Promise<PicGo> {
    this.ctx.emit('uploadProgress', 60)
    this.ctx.log.info('Before upload')
    this.ctx.emit('beforeUpload', this.ctx)
    await this.handlePlugins(this.ctx.helper.beforeUploadPlugins)
    return this.ctx
  }

  private async doUpload (): Promise<PicGo> {
    this.ctx.log.info('Uploading...')
    let type = this.ctx.getConfig<Undefinable<string>>('picBed.uploader') || this.ctx.getConfig<Undefinable<string>>('picBed.current') || 'smms'
    let uploader = this.ctx.helper.uploader.get(type)
    if (!uploader) {
      type = 'smms'
      uploader = this.ctx.helper.uploader.get('smms')
      this.ctx.log.warn(`Can't find uploader - ${type}, switch to default uploader - smms`)
    }
    await uploader?.handle(this.ctx)
    for (const outputImg of this.ctx.output) {
      outputImg.type = type
    }
    return this.ctx
  }

  private async afterUpload (): Promise<PicGo> {
    this.ctx.emit('afterUpload', this.ctx)
    this.ctx.emit('uploadProgress', 100)
    await this.handlePlugins(this.ctx.helper.afterUploadPlugins)
    let msg = ''
    const length = this.ctx.output.length
    for (let i = 0; i < length; i++) {
      msg += handleUrlEncode(this.ctx.output[i].imgUrl)
      if (i !== length - 1) {
        msg += '\n'
      }
      delete this.ctx.output[i].base64Image
      delete this.ctx.output[i].buffer
    }
    this.ctx.emit('finished', this.ctx)
    this.ctx.log.success(`\n${msg}`)
    return this.ctx
  }

  private async handlePlugins (lifeCyclePlugins: LifecyclePlugins): Promise<PicGo> {
    const plugins = lifeCyclePlugins.getList()
    const pluginNames = lifeCyclePlugins.getIdList()
    const lifeCycleName = lifeCyclePlugins.getName()
    await Promise.all(plugins.map(async (plugin: IPlugin, index: number) => {
      try {
        this.ctx.log.info(`${lifeCycleName}: ${pluginNames[index]} running`)
        await plugin.handle(this.ctx)
      } catch (e) {
        this.ctx.log.error(`${lifeCycleName}: ${pluginNames[index]} error`)
        throw e
      }
    }))
    return this.ctx
  }
}

export default Lifecycle
