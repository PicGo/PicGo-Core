import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { cloneDeep } from 'lodash'
import { PicGo } from '../../core/PicGo'
import type { IConfig, IPicGo } from '../../types'

vi.mock('../../utils/getClipboardImage', () => ({
  default: vi.fn(),
  getClipboardImage: vi.fn()
}))

interface IUploadResponse {
  success: boolean
  result: string[]
  code?: string
}

const instances: PicGo[] = []
const directories: string[] = []

const createServer = async (synchronize?: () => Promise<void>): Promise<{
  picgo: PicGo
  endpoint: string
  rootBefore: IConfig
  diskBefore: string
}> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'picgo-option-integration-'))
  directories.push(directory)
  const picgo = new PicGo(path.join(directory, 'config.json'))
  instances.push(picgo)
  for (const method of ['info', 'warn', 'error', 'success', 'debug'] as const) {
    vi.spyOn(picgo.log, method).mockImplementation(() => {})
  }

  picgo.helper.transformer.register('option-integration', {
    handle: async (ctx: IPicGo) => {
      ctx.output = await Promise.all(ctx.input.map(async (input: string) => ({
        origin: input,
        fileName: path.basename(input),
        buffer: await fs.readFile(input)
      })))
    }
  })

  for (const uploader of ['option-a', 'option-b']) {
    picgo.helper.uploader.register(uploader, {
      handle: async (ctx: IPicGo) => {
        const selected = ctx.getConfig<{ destination: string }>(`picBed.${uploader}`)
        await synchronize?.()
        for (const item of ctx.output) {
          item.imgUrl = `https://${selected.destination}.example/${encodeURIComponent(item.buffer!.toString())}/${item.fileName}`
        }
      }
    })
  }

  picgo.uploaderConfig.createOrUpdate('option-a', 'Work', { destination: 'work' })
  picgo.uploaderConfig.createOrUpdate('option-a', 'Home', { destination: 'home' })
  picgo.uploaderConfig.createOrUpdate('option-b', 'Work', { destination: 'other' })
  picgo.saveConfig({ 'picBed.transformer': 'option-integration' })
  const port = await picgo.server.listen(0, '127.0.0.1', true, 'option-test-secret')
  if (typeof port !== 'number') throw new Error('Test server did not start')

  return {
    picgo,
    endpoint: `http://127.0.0.1:${port}/upload`,
    rootBefore: cloneDeep(picgo.getConfig<IConfig>()),
    diskBefore: await fs.readFile(picgo.configPath, 'utf8')
  }
}

const rendezvous = (): (() => Promise<void>) => {
  let arrived = 0
  let release: () => void = () => {}
  const ready = new Promise<void>((resolve) => { release = resolve })
  return async () => {
    arrived++
    if (arrived === 2) release()
    await ready
  }
}

const assertUnchanged = async (picgo: PicGo, rootBefore: IConfig, diskBefore: string): Promise<void> => {
  expect(picgo.getConfig()).toEqual(rootBefore)
  expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(diskBefore)
}

describe('HTTP upload option with real PicGo lifecycle', () => {
  afterEach(async () => {
    for (const instance of instances.splice(0)) instance.server.shutdown()
    await Promise.all(directories.splice(0).map(async directory => await fs.remove(directory)))
    vi.restoreAllMocks()
  })

  it.each([
    { label: 'literal Chinese', configName: '配置一', query: 'configName=配置一' },
    { label: 'percent-encoded Chinese', configName: '配置一', query: 'configName=%E9%85%8D%E7%BD%AE%E4%B8%80' },
    {
      label: 'Chinese with spaces, plus and ampersand',
      configName: '配置一 + 测试&备份',
      query: new URLSearchParams({ configName: '配置一 + 测试&备份' }).toString()
    },
    {
      label: 'Chinese with a literal percent escape decoded only once',
      configName: '配置%20一',
      query: 'configName=%E9%85%8D%E7%BD%AE%2520%E4%B8%80'
    }
  ])('uploads using $label configuration names from the URL', async ({ configName, query }) => {
    const { picgo, endpoint } = await createServer()
    picgo.uploaderConfig.createOrUpdate('option-a', configName, { destination: 'chinese' })
    picgo.uploaderConfig.use('option-b', 'Work')
    const rootBefore = cloneDeep(picgo.getConfig<IConfig>())
    const diskBefore = await fs.readFile(picgo.configPath, 'utf8')
    const image = path.join(picgo.baseDir, 'image.png')
    await fs.writeFile(image, 'image-data')
    const upload = vi.spyOn(picgo, 'upload')
    const save = vi.spyOn(picgo, 'saveConfig')

    const response = await fetch(`${endpoint}?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer option-test-secret' },
      body: JSON.stringify({ list: [image] })
    })

    expect(response.status).toBe(200)
    expect(upload).toHaveBeenCalledWith([image], { configName })
    expect(await response.json()).toMatchObject({
      success: true,
      result: ['https://chinese.example/image-data/image.png']
    })
    expect(save).not.toHaveBeenCalled()
    await assertUnchanged(picgo, rootBefore, diskBefore)
  })

  it('isolates concurrent JSON uploads to two profiles and preserves root and disk configuration', async () => {
    const { picgo, endpoint, rootBefore, diskBefore } = await createServer(rendezvous())
    const image = path.join(picgo.baseDir, 'image.png')
    await fs.writeFile(image, 'image-data')
    const save = vi.spyOn(picgo, 'saveConfig')
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer option-test-secret' }
    const responses = await Promise.all([
      fetch(`${endpoint}?uploader=option-a&configName=Work`, {
        method: 'POST', headers, body: JSON.stringify({ list: [image] })
      }),
      fetch(`${endpoint}?configId=missing&configName=Home`, {
        method: 'POST', headers, body: JSON.stringify({ list: [image] })
      })
    ])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const results = await Promise.all(responses.map(async response => await response.json() as IUploadResponse))
    expect(results.map(result => result.result)).toEqual([
      ['https://work.example/image-data/image.png'],
      ['https://home.example/image-data/image.png']
    ])
    expect(save).not.toHaveBeenCalled()
    expect(await fs.readFile(image, 'utf8')).toBe('image-data')
    await assertUnchanged(picgo, rootBefore, diskBefore)
  })

  it.each([
    { label: 'default configuration', query: '', destination: 'other' },
    { label: 'explicit upload options', query: '?uploader=option-a&configName=Work', destination: 'work' }
  ])('retains existing local files uploaded with $label', async ({ query, destination }) => {
    const { picgo, endpoint, rootBefore, diskBefore } = await createServer()
    const image = path.join(picgo.baseDir, 'existing.png')
    await fs.writeFile(image, 'existing-data')
    const save = vi.spyOn(picgo, 'saveConfig')

    const response = await fetch(`${endpoint}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer option-test-secret' },
      body: JSON.stringify({ list: [image] })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      result: [`https://${destination}.example/existing-data/existing.png`]
    })
    expect(await fs.readFile(image, 'utf8')).toBe('existing-data')
    expect(await fs.pathExists(path.join(picgo.baseDir, 'picgo-form-images'))).toBe(false)
    expect(save).not.toHaveBeenCalled()
    await assertUnchanged(picgo, rootBefore, diskBefore)
  })

  it('keeps identical multipart filenames and bytes independent across selected destinations', async () => {
    const { picgo, endpoint, rootBefore, diskBefore } = await createServer(rendezvous())
    const responses = await Promise.all(['first', 'second'].map(async (contents, index) => {
      const body = new FormData()
      body.append('files', new Blob([contents]), 'same.png')
      return await fetch(`${endpoint}?uploader=option-a&configName=${index === 0 ? 'Work' : 'Home'}`, {
        method: 'POST', headers: { Authorization: 'Bearer option-test-secret' }, body
      })
    }))
    expect(responses.map(response => response.status)).toEqual([200, 200])
    const results = await Promise.all(responses.map(async response => await response.json() as IUploadResponse))
    expect(results.map(result => result.result)).toEqual([
      ['https://work.example/first/same.png'],
      ['https://home.example/second/same.png']
    ])
    expect(await fs.readdir(path.join(picgo.baseDir, 'picgo-form-images'))).toEqual([])
    await assertUnchanged(picgo, rootBefore, diskBefore)
  })

  it('rejects ambiguous names before running upload and keeps auth ahead of configuration lookup', async () => {
    const { picgo, endpoint, rootBefore, diskBefore } = await createServer()
    const upload = vi.spyOn(picgo, 'upload')
    const unauthorized = await fetch(`${endpoint}?configName=Work`, { method: 'POST' })
    expect(unauthorized.status).toBe(401)

    const response = await fetch(`${endpoint}?configName=Work`, {
      method: 'POST', headers: { Authorization: 'Bearer option-test-secret' }
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false, code: 'UPLOAD_CONFIG_AMBIGUOUS', result: [], items: [] })
    expect(upload).not.toHaveBeenCalled()
    await assertUnchanged(picgo, rootBefore, diskBefore)
  })
})
