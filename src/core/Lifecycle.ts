import { EventEmitter } from 'events'
import { ILifecyclePlugins, IPicGo, IPlugin, OutputFormat, Undefinable, UploadOptions } from '../types'
import { handleUrlEncode } from '../utils/common'
import { applyUrlRewriteToOutput } from '../utils/urlRewrite'
import { IBuildInEvent, LifecycleStep } from '../utils/enum'
import { createContext } from '../utils/createContext'

export class Lifecycle extends EventEmitter {
  private readonly ctx: IPicGo
  private step: LifecycleStep = LifecycleStep.IDLE

  constructor (ctx: IPicGo) {
    super()
    this.ctx = ctx
  }

  async start (input: any[], options?: UploadOptions): Promise<IPicGo> {
    // ensure every upload process has an unique context
    const ctx = createContext(this.ctx)
    this.step = LifecycleStep.IDLE
    try {
      // images input
      if (!Array.isArray(input)) {
        throw new Error('Input must be an array.')
      }
      ctx.input = input
      ctx.output = []

      // lifecycle main
      this.step = LifecycleStep.BEFORE_TRANSFORM
      await this.beforeTransform(ctx)
      this.step = LifecycleStep.TRANSFORM
      await this.doTransform(ctx)
      this.step = LifecycleStep.BEFORE_UPLOAD
      await this.beforeUpload(ctx)
      this.step = LifecycleStep.UPLOAD
      await this.doUpload(ctx)
      this.step = LifecycleStep.AFTER_UPLOAD
      await this.afterUpload(ctx, options)
      return ctx
    } catch (e: any) {
      // If error came from doUpload and some items already uploaded successfully,
      // still run afterUpload so users see the successful URLs and plugins
      // (like cloud auto-import) can process the partial results.
      if (this.step === LifecycleStep.UPLOAD && ctx.output.some(item => item.imgUrl !== undefined)) {
        try {
          this.step = LifecycleStep.AFTER_UPLOAD
          await this.afterUpload(ctx, options)
        } catch {
          // afterUpload failed too — don't mask the original upload error
        }
      }
      ctx.log.warn(IBuildInEvent.FAILED)
      ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, -1)
      ctx.emit(IBuildInEvent.FAILED, e)
      ctx.log.error(e)
      if (ctx.getConfig<Undefinable<string>>('debug')) {
        throw e
      }
      return ctx
    }
  }

  private async beforeTransform (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 0)
    ctx.emit(IBuildInEvent.BEFORE_TRANSFORM, ctx)
    ctx.log.info('Before transform')
    await this.handlePlugins(ctx.helper.beforeTransformPlugins, ctx)
    return ctx
  }

  private async doTransform (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 30)
    const type = ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path'
    let currentTransformer = type
    let transformer = ctx.helper.transformer.get(type)
    if (!transformer) {
      transformer = ctx.helper.transformer.get('path')
      currentTransformer = 'path'
      ctx.log.warn(`Can't find transformer - ${type}, switch to default transformer - path`)
    }
    ctx.log.info(`Transforming... Current transformer is [${currentTransformer}]`)
    await transformer?.handle(ctx)
    return ctx
  }

  private async beforeUpload (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 60)
    ctx.log.info('Before upload')
    ctx.emit(IBuildInEvent.BEFORE_UPLOAD, ctx)
    await this.handlePlugins(ctx.helper.beforeUploadPlugins, ctx)
    return ctx
  }

  private async doUpload (ctx: IPicGo): Promise<IPicGo> {
    let type = ctx.getConfig<Undefinable<string>>('picBed.uploader') || ctx.getConfig<Undefinable<string>>('picBed.current') || 'smms'
    let uploader = ctx.helper.uploader.get(type)
    let currentTransformer = type
    if (!uploader) {
      type = 'smms'
      currentTransformer = 'smms'
      uploader = ctx.helper.uploader.get('smms')
      ctx.log.warn(`Can't find uploader - ${type}, switch to default uploader - smms`)
    }
    ctx.log.info(`Uploading... Current uploader is [${currentTransformer}]`)
    await uploader?.handle(ctx)
    for (const outputImg of ctx.output) {
      outputImg.type = type
    }
    return ctx
  }

  private async afterUpload (ctx: IPicGo, options?: UploadOptions): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.AFTER_UPLOAD, ctx)
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 100)

    applyUrlRewriteToOutput(ctx)

    await this.handlePlugins(ctx.helper.afterUploadPlugins, ctx)

    const msg = this.buildSuccessMessage(ctx, options)
    for (const outputImg of ctx.output) {
      delete outputImg.base64Image
      delete outputImg.buffer
    }

    ctx.emit(IBuildInEvent.FINISHED, ctx)
    ctx.log.success(`\n${msg}`)
    await this.handlePlugins(ctx.helper.afterFinishPlugins, ctx, { consoleOutput: false })
    return ctx
  }

  private buildSuccessMessage (ctx: IPicGo, options?: UploadOptions): string {
    if (options?.outputFormat === OutputFormat.JSON) {
      return JSON.stringify(ctx.output.map(item => ({
        imgUrl: item.imgUrl,
        origin: item.origin,
        fileName: item.fileName,
        type: item.type,
        contentType: item.contentType,
        size: item.size,
        width: item.width,
        height: item.height,
        extname: item.extname
      })))
    }

    let msg = ''
    const length = ctx.output.length
    const isEncodeOutputURL = ctx.getConfig<Undefinable<boolean>>('settings.encodeOutputURL') === true

    for (let i = 0; i < length; i++) {
      if (typeof ctx.output[i].imgUrl !== 'undefined') {
        msg += isEncodeOutputURL ? handleUrlEncode(ctx.output[i].imgUrl!) : ctx.output[i].imgUrl!
        if (i !== length - 1) {
          msg += '\n'
        }
      }
    }

    return msg
  }

  private async handlePlugins (lifeCyclePlugins: ILifecyclePlugins, ctx: IPicGo, options?: { consoleOutput?: boolean }): Promise<IPicGo> {
    const plugins = lifeCyclePlugins.getList()
    const pluginNames = lifeCyclePlugins.getIdList()
    const lifeCycleName = lifeCyclePlugins.getName()
    if (options?.consoleOutput === false) {
      const fileOnlyLogger = ctx.log.createLogger?.({ consoleOutput: false })
      if (fileOnlyLogger) {
        ctx.log = fileOnlyLogger
      }
    }
    await Promise.all(plugins.map(async (plugin: IPlugin, index: number) => {
      try {
        ctx.log.info(`${lifeCycleName}: ${pluginNames[index]} running`)
        await plugin.handle(ctx)
      } catch (e) {
        ctx.log.error(`${lifeCycleName}: ${pluginNames[index]} error`)
        throw e
      }
    }))
    return ctx
  }
}

export default Lifecycle
