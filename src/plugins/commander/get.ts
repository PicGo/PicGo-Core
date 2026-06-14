import type { IPicGo, IPlugin, IStringKeyMap } from '../../types'
import type { ILocalesKey } from '../../i18n/zh-CN'
import { PICGO_CLOUD } from '../../utils/static'

interface GetOptions {
  format?: string
}

interface PluginEntry {
  name: string
  enabled: boolean
}

// 取值逻辑对齐 src/core/Lifecycle.ts 的真实上传选择：
// picBed.uploader -> picBed.current -> PICGO_CLOUD（'picgo-cloud'）。
// 注意：use.ts/setting.ts 里用的 'smms' 兜底是过时的交互默认值，与真实上传逻辑不一致，别抄。
const resolveUploader = (ctx: IPicGo): string => {
  return ctx.getConfig<string | undefined>('picBed.uploader') ||
    ctx.getConfig<string | undefined>('picBed.current') ||
    PICGO_CLOUD
}

// 对齐 Lifecycle.ts 的 transformer 兜底逻辑，默认 'path'。
const resolveTransformer = (ctx: IPicGo): string => {
  return ctx.getConfig<string | undefined>('picBed.transformer') || 'path'
}

// 启用态以 config 的 picgoPlugins（{ [name]: boolean }）为准，
// 而不是 pluginLoader.getList()——CLI 冷启动可能尚未 load 第三方插件。
const resolvePlugins = (ctx: IPicGo): PluginEntry[] => {
  const plugins = ctx.getConfig<IStringKeyMap<boolean>>('picgoPlugins') || {}
  return Object.keys(plugins).map((name: string) => ({
    name,
    enabled: !!plugins[name]
  }))
}

const isJson = (options: GetOptions): boolean => options.format === 'json'

const createUploaderAction = (ctx: IPicGo) => (options: GetOptions): string => {
  const uploader = resolveUploader(ctx)
  if (isJson(options)) {
    // json 模式只许输出一行可 JSON.parse 的内容，用裸 console.log，不走 ctx.log。
    console.log(JSON.stringify({ uploader }))
  } else {
    console.log(uploader)
  }
  return uploader
}

const createTransformerAction = (ctx: IPicGo) => (options: GetOptions): string => {
  const transformer = resolveTransformer(ctx)
  if (isJson(options)) {
    console.log(JSON.stringify({ transformer }))
  } else {
    console.log(transformer)
  }
  return transformer
}

const createPluginsAction = (ctx: IPicGo) => (options: GetOptions): PluginEntry[] => {
  const plugins = resolvePlugins(ctx)
  if (isJson(options)) {
    console.log(JSON.stringify({ plugins }))
  } else if (plugins.length === 0) {
    console.log(ctx.i18n.translate<ILocalesKey>('GET_PLUGINS_EMPTY'))
  } else {
    plugins.forEach(({ name, enabled }) => {
      console.log(`${name}\t${enabled ? 'enabled' : 'disabled'}`)
    })
  }
  return plugins
}

const get: IPlugin = {
  handle: (ctx: IPicGo) => {
    const getCommand = ctx.cmd.program
      .command('get')
      .description('get current picgo module config (uploader/transformer/plugins)')

    getCommand
      .command('uploader')
      .description('get current uploader type')
      .option('--format <format>', 'output format: pretty | json', 'pretty')
      .action((options: GetOptions) => { createUploaderAction(ctx)(options) })

    getCommand
      .command('transformer')
      .description('get current transformer')
      .option('--format <format>', 'output format: pretty | json', 'pretty')
      .action((options: GetOptions) => { createTransformerAction(ctx)(options) })

    getCommand
      .command('plugins')
      .description('list installed plugins with enabled/disabled state')
      .option('--format <format>', 'output format: pretty | json', 'pretty')
      .action((options: GetOptions) => { createPluginsAction(ctx)(options) })
  }
}

export {
  get,
  resolveUploader,
  resolveTransformer,
  resolvePlugins,
  createUploaderAction,
  createTransformerAction,
  createPluginsAction
}
