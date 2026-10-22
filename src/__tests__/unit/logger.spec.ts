import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../lib/Logger'
import type { IPicGo } from '../../types'
import { LogConsoleStream } from '../../types'

let tmpDir: string
let logPath: string
let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

const createCtx = (config: Record<string, unknown> = {}): IPicGo => {
  return {
    baseDir: tmpDir,
    getConfig: vi.fn((key: string) => {
      if (key === 'settings.logPath') return logPath
      return config[key]
    })
  } as unknown as IPicGo
}

// File writes happen in a setTimeout(0) after the console output.
const flushFileWrites = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 10))
}

const readLog = (): string => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '')

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picgo-logger-'))
  logPath = path.join(tmpDir, 'picgo.log')
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('Logger console stream', () => {
  it('writes console output to stdout (console.log) by default and still writes the log file', async () => {
    const logger = new Logger(createCtx())

    logger.info('hello-stdout')
    await flushFileWrites()

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[PicGo INFO]:'), 'hello-stdout')
    expect(errorSpy).not.toHaveBeenCalled()
    expect(readLog()).toContain('[PicGo INFO] hello-stdout')
  })

  it('writes console output to stderr (console.error) with LogConsoleStream.STDERR and still writes the log file', async () => {
    const logger = new Logger(createCtx(), { consoleStream: LogConsoleStream.STDERR })

    logger.success('hello-stderr')
    logger.error(new Error('boom'))
    await flushFileWrites()

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[PicGo SUCCESS]:'), 'hello-stderr')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[PicGo ERROR]:'), expect.any(Error))
    expect(logSpy).not.toHaveBeenCalled()
    const content = readLog()
    expect(content).toContain('[PicGo SUCCESS] hello-stderr')
    expect(content).toContain('boom')
  })

  it('createLogger forwards consoleStream to the new logger', async () => {
    const logger = new Logger(createCtx()).createLogger({ consoleStream: LogConsoleStream.STDERR })

    logger.warn('child-warn')
    await flushFileWrites()

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[PicGo WARN]:'), 'child-warn')
    expect(logSpy).not.toHaveBeenCalled()
    expect(readLog()).toContain('[PicGo WARN] child-warn')
  })

  it('sends the oversized log file warning to the configured stream', async () => {
    fs.writeFileSync(logPath, 'x'.repeat(2048))
    const logger = new Logger(createCtx({ 'settings.logFileSizeLimit': 0.001 }), { consoleStream: LogConsoleStream.STDERR })

    logger.info('after-rotate')
    await flushFileWrites()

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[PicGo WARN]:'), expect.stringContaining('Log file is too large'))
    expect(logSpy).not.toHaveBeenCalled()
    expect(readLog()).toContain('after-rotate')
  })

  it('keeps silent mode semantics: no console output and no file write', async () => {
    const logger = new Logger(createCtx({ silent: true }), { consoleStream: LogConsoleStream.STDERR })

    logger.info('quiet')
    await flushFileWrites()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(readLog()).toBe('')
  })
})
