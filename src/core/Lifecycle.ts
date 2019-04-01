import { EventEmitter } from 'events'
import PicGo from './PicGo'
import { Plugin } from '../utils/interfaces'

class Lifecycle extends EventEmitter {
  configPath: string
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
      await this.beforeTransform(this.ctx)
      await this.doTransform(this.ctx)
      await this.beforeUpload(this.ctx)
      await this.doUpload(this.ctx)
      await this.afterUpload(this.ctx)
      return this.ctx
    } catch (e) {
      console.log('failed')
      this.ctx.emit('uploadProgress', -1)
      this.ctx.emit('failed', e)
      this.ctx.log.error(e)
      if (this.ctx.config.debug) {
        Promise.reject(e)
      }
    }
  }
  private async beforeTransform (ctx: PicGo): Promise<PicGo> {
    this.ctx.emit('uploadProgress', 0)
    this.ctx.emit('beforeTransform', ctx)
    this.ctx.log.info('Before transform')
    await this.handlePlugins(ctx.helper.beforeTransformPlugins.getList(), ctx)
    return ctx
  }
  private async doTransform (ctx: PicGo): Promise<PicGo> {
    this.ctx.emit('uploadProgress', 30)
    this.ctx.log.info('Transforming...')
    let type = ctx.config.picBed.transformer || 'path'
    let transformer = this.ctx.helper.transformer.get(type)
    if (!transformer) {
      transformer = this.ctx.helper.transformer.get('path')
      ctx.log.warn(`Can't find transformer - ${type}, swtich to default transformer - path`)
    }
    await transformer.handle(ctx)
    return ctx
  }
  private async beforeUpload (ctx: PicGo): Promise<PicGo> {
    this.ctx.emit('uploadProgress', 60)
    this.ctx.log.info('Before upload')
    this.ctx.emit('beforeUpload', ctx)
    await this.handlePlugins(ctx.helper.beforeUploadPlugins.getList(), ctx)
    return ctx
  }
  private async doUpload (ctx: PicGo): Promise<PicGo> {
    this.ctx.log.info('Uploading...')
    let type = ctx.config.picBed.uploader || ctx.config.picBed.current || 'smms'
    let uploader = this.ctx.helper.uploader.get(type)
    if (!uploader) {
      type = 'smms'
      uploader = this.ctx.helper.uploader.get('smms')
      ctx.log.warn(`Can't find uploader - ${type}, swtich to default uploader - smms`)
    }
    await uploader.handle(ctx)
    for (let i in ctx.output) {
      ctx.output[i].type = type
    }
    return ctx
  }
  private async afterUpload (ctx: PicGo): Promise<PicGo> {
    this.ctx.emit('afterUpload', ctx)
    this.ctx.emit('uploadProgress', 100)
    await this.handlePlugins(ctx.helper.afterUploadPlugins.getList(), ctx)
    let msg = ''
    for (let i in ctx.output) {
      msg += ctx.output[i].imgUrl + '\n'
      delete ctx.output[i].base64Image
      delete ctx.output[i].buffer
    }
    this.ctx.emit('finished', ctx)
    this.ctx.log.success(`\n${msg}`)
    return ctx
  }

  private async handlePlugins (plugins: Plugin[], ctx: PicGo): Promise<PicGo> {
    await Promise.all(plugins.map(async (plugin: Plugin) => {
      await plugin.handle(ctx)
    }))
    return ctx
  }
}

export default Lifecycle
