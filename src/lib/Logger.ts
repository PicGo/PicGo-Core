import chalk from 'chalk'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import path from 'path'
import util from 'util'
import { ILogType } from '../utils/enum'
import {
  ILogArgvType,
  ILogArgvTypeWithError,
  Undefinable,
  ILogColor,
  ILogger,
  IPicGo,
  LogConsoleStream
} from '../types'
import { forceNumber, isDev } from '../utils/common'

export class Logger implements ILogger {
  private readonly level = {
    [ILogType.success]: 'green',
    [ILogType.info]: 'blue',
    [ILogType.warn]: 'yellow',
    [ILogType.error]: 'red',
    [ILogType.debug]: 'magenta'
  }

  private readonly ctx: IPicGo
  private readonly consoleOutput: boolean
  private readonly respectSilent: boolean
  private readonly consoleStream: LogConsoleStream
  private logLevel!: string | string[]
  private logPath!: string
  private logPathOverride?: string

  constructor (
    ctx: IPicGo,
    options: {
      /** Whether to output to console. Defaults to true. */
      consoleOutput?: boolean
      /**
       * Whether to obey the global `silent` config.
       * - true (default): when `silent` is enabled, both console output and file writes are suppressed.
       * - false: file writes always happen regardless of `silent`, useful for audit/diagnostic logs
       *   that must not be lost even in silent mode.
       */
      respectSilent?: boolean
      /** Override the log file path. Defaults to `settings.logPath` or `ctx.baseDir/picgo.log`. */
      logPath?: string
      /**
       * Which stream console output goes to. Defaults to `LogConsoleStream.STDOUT`. Use `STDERR` when stdout must stay
       * machine-readable (e.g. `picgo upload --format json`). Log file writes are not affected.
       */
      consoleStream?: LogConsoleStream
    } = {}
  ) {
    this.ctx = ctx
    this.consoleOutput = options.consoleOutput ?? true
    this.respectSilent = options.respectSilent ?? true
    this.logPathOverride = options.logPath
    this.consoleStream = options.consoleStream ?? LogConsoleStream.STDOUT
  }

  private writeConsole (...args: unknown[]): void {
    if (this.consoleStream === LogConsoleStream.STDERR) {
      console.error(...args)
    } else {
      console.log(...args)
    }
  }

  private handleLog (type: ILogType, ...msg: ILogArgvTypeWithError[]): void {
    this.logLevel = this.ctx.getConfig('settings.logLevel')
    const isSilent = this.ctx.getConfig<Undefinable<string>>('silent')
    const shouldWrite = (!this.respectSilent || !isSilent) && this.checkLogLevel(type, this.logLevel)
    if (shouldWrite) {
      const logHeader = chalk[this.level[type] as ILogColor](`[PicGo ${type.toUpperCase()}]:`)
      if (this.consoleOutput && !isSilent) {
        this.writeConsole(logHeader, ...msg)
      }
      this.logPath = this.logPathOverride || this.ctx.getConfig<Undefinable<string>>('settings.logPath') || path.join(this.ctx.baseDir, './picgo.log')
      setTimeout(() => {
        // fix log file is too large, now the log file's default size is 10 MB
        try {
          const result = this.checkLogFileIsLarge(this.logPath)
          if (result.isLarge) {
            const warningMsg = `Log file is too large (> ${(result.logFileSizeLimit!) / 1024 / 1024 || '10'} MB), recreate log file`
            if (this.consoleOutput && !isSilent) {
              this.writeConsole(chalk.yellow('[PicGo WARN]:'), warningMsg)
            }
            this.recreateLogFile(this.logPath)
            msg.unshift(warningMsg)
          }
          this.handleWriteLog(this.logPath, type, ...msg)
        } catch (e) {
          // why???
          console.error('[PicGo Error] on checking log file size', e)
        }
      }, 0)
    }
  }

  private checkLogFileIsLarge (logPath: string): {
    isLarge: boolean
    logFileSize?: number
    logFileSizeLimit?: number
  } {
    if (fs.existsSync(logPath)) {
      const logFileSize = fs.statSync(logPath).size
      const logFileSizeLimit = forceNumber(this.ctx.getConfig<Undefinable<number>>('settings.logFileSizeLimit') || 10) * 1024 * 1024 // 10 MB default
      return {
        isLarge: logFileSize > logFileSizeLimit,
        logFileSize,
        logFileSizeLimit
      }
    }
    return {
      isLarge: false
    }
  }

  private recreateLogFile (logPath: string): void {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath)
      fs.createFileSync(logPath)
    }
  }

  private handleWriteLog (logPath: string, type: string, ...msg: ILogArgvTypeWithError[]): void {
    try {
      let log = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicGo ${type.toUpperCase()}] `
      msg.forEach((item: ILogArgvTypeWithError) => {
        if (item instanceof Error && type === 'error') {
          log += `\n------Error Stack Begin------\n${util.format(item?.stack)}\n-------Error Stack End------- `
        } else {
          if (typeof item === 'object') {
            item = JSON.stringify(item, null, 2)
          }
          log += `${item as string} `
        }
      })
      log += '\n'
      // A synchronized approach to avoid log msg sequence errors
      fs.appendFileSync(logPath, log)
    } catch (e) {
      console.error('[PicGo Error] on writing log file', e)
    }
  }

  private checkLogLevel (type: string, level: undefined | string | string[]): boolean {
    if (level === undefined || level === 'all') {
      return true
    }
    if (Array.isArray(level)) {
      return level.some((item: string) => (item === type || item === 'all'))
    } else {
      return type === level
    }
  }

  success (...msg: ILogArgvType[]): void {
    return this.handleLog(ILogType.success, ...msg)
  }

  info (...msg: ILogArgvType[]): void {
    return this.handleLog(ILogType.info, ...msg)
  }

  error (...msg: ILogArgvTypeWithError[]): void {
    return this.handleLog(ILogType.error, ...msg)
  }

  warn (...msg: ILogArgvType[]): void {
    return this.handleLog(ILogType.warn, ...msg)
  }

  debug (...msg: ILogArgvType[]): void {
    if (isDev()) {
      this.handleLog(ILogType.debug, ...msg)
    }
  }

  createLogger (options: {
    /** Override the log file path. */
    logPath?: string
    /** Whether to output to console. Defaults to true. */
    consoleOutput?: boolean
    /**
     * Whether to obey the global `silent` config.
     * - true (default): silent mode suppresses both console and file output.
     * - false: file writes always happen, useful for audit/diagnostic logs.
     */
    respectSilent?: boolean
    /** Stream used for console output. Defaults to `LogConsoleStream.STDOUT`. */
    consoleStream?: LogConsoleStream
  } = {}): Logger {
    return new Logger(this.ctx, options)
  }
}

export default Logger
