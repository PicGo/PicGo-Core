import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPicGo, IProgress } from '../../types'
import { IBuildInEvent } from '../../utils/enum'

const spinnerStubs: Array<{
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  isSpinning: boolean
  text: string
}> = []

vi.mock('ora', () => {
  return {
    default: () => {
      const stub = {
        text: '',
        isSpinning: false,
        start: vi.fn(function (this: { isSpinning: boolean }) { this.isSpinning = true; return this }),
        stop: vi.fn(function (this: { isSpinning: boolean }) { this.isSpinning = false; return this })
      }
      spinnerStubs.push(stub)
      return stub
    }
  }
})

const importRenderer = async (): Promise<typeof import('../../plugins/commander/utils/progressRenderer')> => {
  return await import('../../plugins/commander/utils/progressRenderer')
}

const makeCtx = (): IPicGo => {
  return Object.assign(new EventEmitter(), {}) as unknown as IPicGo
}

const sample = (overrides: Partial<IProgress> = {}): IProgress => ({
  current: 5,
  total: 10,
  fraction: 0.5,
  ...overrides
})

let originalIsTTY: boolean | undefined
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  spinnerStubs.length = 0
  originalIsTTY = process.stdout.isTTY
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true })
  logSpy.mockRestore()
})

const setTTY = (value: boolean): void => {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true })
}

describe('createProgressRenderer', () => {
  it('TTY mode: starts spinner and renders bar + label on first event', async () => {
    setTTY(true)
    const { createProgressRenderer } = await importRenderer()
    const ctx = makeCtx()
    const handle = createProgressRenderer<IProgress>({
      ctx,
      event: IBuildInEvent.FILE_UPLOAD_PROGRESS,
      verbose: false,
      formatBarText: (p) => `loaded=${p.current}/${p.total}`,
      formatVerboseText: () => 'should-not-be-used'
    })
    ;(ctx as unknown as EventEmitter).emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, sample())
    expect(handle.spinner.start).toHaveBeenCalled()
    expect(handle.spinner.text).toMatch(/loaded=5\/10/)
    expect(logSpy).not.toHaveBeenCalled()
    handle.dispose()
  })

  it('Verbose mode: prints a line per event, never starts spinner', async () => {
    setTTY(true) // even on TTY, verbose=true forces line output
    const { createProgressRenderer } = await importRenderer()
    const ctx = makeCtx()
    const handle = createProgressRenderer<IProgress>({
      ctx,
      event: IBuildInEvent.FILE_UPLOAD_PROGRESS,
      verbose: true,
      formatBarText: () => 'unused',
      formatVerboseText: (p) => `[verbose] ${p.current}/${p.total}`
    })
    ;(ctx as unknown as EventEmitter).emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, sample())
    ;(ctx as unknown as EventEmitter).emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, sample({ current: 8 }))
    expect(handle.spinner.start).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(logSpy).toHaveBeenNthCalledWith(1, '[verbose] 5/10')
    expect(logSpy).toHaveBeenNthCalledWith(2, '[verbose] 8/10')
    handle.dispose()
  })

  it('Non-TTY mode (stdout piped): behaves as verbose even when verbose flag is false', async () => {
    setTTY(false)
    const { createProgressRenderer } = await importRenderer()
    const ctx = makeCtx()
    const handle = createProgressRenderer<IProgress>({
      ctx,
      event: IBuildInEvent.FILE_UPLOAD_PROGRESS,
      verbose: false,
      formatBarText: () => 'unused',
      formatVerboseText: () => 'piped-output'
    })
    ;(ctx as unknown as EventEmitter).emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, sample())
    expect(handle.spinner.start).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('piped-output')
    handle.dispose()
  })

  it('dispose removes the event listener and stops a running spinner', async () => {
    setTTY(true)
    const { createProgressRenderer } = await importRenderer()
    const ctx = makeCtx()
    const handle = createProgressRenderer<IProgress>({
      ctx,
      event: IBuildInEvent.FILE_UPLOAD_PROGRESS,
      verbose: false,
      formatBarText: () => 'x',
      formatVerboseText: () => 'x'
    })
    ;(ctx as unknown as EventEmitter).emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, sample())
    expect(handle.spinner.isSpinning).toBe(true)
    handle.dispose()
    expect(handle.spinner.stop).toHaveBeenCalled()
    // emitting after dispose should NOT be picked up
    handle.spinner.text = '<dispose-marker>'
    ;(ctx as unknown as EventEmitter).emit(IBuildInEvent.FILE_UPLOAD_PROGRESS, sample({ current: 10 }))
    expect(handle.spinner.text).toBe('<dispose-marker>')
  })
})
