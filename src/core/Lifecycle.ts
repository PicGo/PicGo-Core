import { EventEmitter } from 'events'
import { ILifecyclePlugins, IPicGo, IPlugin, Undefinable } from '../types'
import { handleUrlEncode } from '../utils/common'
import { IBuildInEvent } from '../utils/enum'

class Lifecycle extends EventEmitter {
  private ctx: IPicGo

  constructor (ctx: IPicGo) {
    super()
    this.ctx = ctx
  }

  async start (input: any[]): Promise<IPicGo> {
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
      this.ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, -1)
      this.ctx.emit(IBuildInEvent.FAILED, e)
      this.ctx.log.error(e)
      if (this.ctx.getConfig<Undefinable<string>>('debug')) {
        throw e
      }
      return this.ctx
    }
  }

  private async beforeTransform (): Promise<IPicGo> {
    this.ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 0)
    this.ctx.emit(IBuildInEvent.BEFORE_TRANSFORM, this.ctx)
    this.ctx.log.info('Before transform')
    await this.handlePlugins(this.ctx.helper.beforeTransformPlugins)
    return this.ctx
  }

  private async doTransform (): Promise<IPicGo> {
    this.ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 30)
    const type = this.ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path'
    let currentTransformer = type
    let transformer = this.ctx.helper.transformer.get(type)
    if (!transformer) {
      transformer = this.ctx.helper.transformer.get('path')
      currentTransformer = 'path'
      this.ctx.log.warn(`Can't find transformer - ${type}, switch to default transformer - path`)
    }
    this.ctx.log.info(`Transforming... Current transformer is [${currentTransformer}]`)
    await transformer?.handle(this.ctx)
    return this.ctx
  }

  private async beforeUpload (): Promise<IPicGo> {
    this.ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 60)
    this.ctx.log.info('Before upload')
    this.ctx.emit(IBuildInEvent.BEFORE_UPLOAD, this.ctx)
    await this.handlePlugins(this.ctx.helper.beforeUploadPlugins)
    return this.ctx
  }

  private async doUpload (): Promise<IPicGo> {
    let type = this.ctx.getConfig<Undefinable<string>>('picBed.uploader') || this.ctx.getConfig<Undefinable<string>>('picBed.current') || 'smms'
    let uploader = this.ctx.helper.uploader.get(type)
    let currentTransformer = type
    if (!uploader) {
      type = 'smms'
      currentTransformer = 'smms'
      uploader = this.ctx.helper.uploader.get('smms')
      this.ctx.log.warn(`Can't find uploader - ${type}, switch to default uploader - smms`)
    }
    this.ctx.log.info(`Uploading... Current uploader is [${currentTransformer}]`)
    await uploader?.handle(this.ctx)
    for (const outputImg of this.ctx.output) {
      outputImg.type = type
    }
    return this.ctx
  }

  private async afterUpload (): Promise<IPicGo> {
    this.ctx.emit(IBuildInEvent.AFTER_UPLOAD, this.ctx)
    this.ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 100)
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
    this.ctx.emit(IBuildInEvent.FINISHED, this.ctx)
    this.ctx.log.success(`\n${msg}`)
    return this.ctx
  }

  private async handlePlugins (lifeCyclePlugins: ILifecyclePlugins): Promise<IPicGo> {
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
