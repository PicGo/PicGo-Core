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
  IPicGo
} from '../types'

// Convert enum into union, see: https://stackoverflow.com/a/52396706
export type LogLevel = `${ILogType}` | 'all'

export class Logger implements ILogger {
  private readonly level = {
    [ILogType.success]: 'green',
    [ILogType.info]: 'blue',
    [ILogType.warn]: 'yellow',
    [ILogType.error]: 'red'
  }

  private readonly ctx: IPicGo
  constructor (ctx: IPicGo) {
    this.ctx = ctx
  }

  get logPath (): string {
    return this.ctx.getConfig<Undefinable<string>>('settings.logPath') || path.join(this.ctx.baseDir, './picgo.log')
  }

  get logLevel (): LogLevel | LogLevel[] {
    return this.ctx.getConfig<Undefinable<LogLevel>>('settings.logLevel') ?? 'all'
  }

  private handleLog (type: ILogType, ...msg: ILogArgvTypeWithError[]): void {
    // check config.silent
    if (!this.ctx.getConfig<Undefinable<string>>('silent')) {
      const logHeader = chalk[this.level[type] as ILogColor](`[PicGo ${type.toUpperCase()}]:`)
      console.log(logHeader, ...msg)
      setTimeout(() => {
        this.handleWriteLog(this.logPath, type, ...msg)
      }, 0)
    }
  }

  private handleWriteLog (logPath: string, type: string, ...msg: ILogArgvTypeWithError[]): void {
    try {
      if (this.checkLogLevel(type, this.logLevel)) {
        let log = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicGo ${type.toUpperCase()}] `
        msg.forEach((item: ILogArgvTypeWithError) => {
          if (typeof item === 'object' && type === 'error') {
            log += `\n------Error Stack Begin------\n${util.format(item.stack)}\n-------Error Stack End------- `
          } else {
            if (typeof item === 'object') {
              item = JSON.stringify(item)
            }
            log += `${item} `
          }
        })
        log += '\n'
        // A synchronized approach to avoid log msg sequence errors
        fs.appendFileSync(logPath, log)
      }
    } catch (e) {
      console.log(e)
    }
  }

  private checkLogLevel (type: string, level?: LogLevel | LogLevel[]): boolean {
    if (level === undefined || level === 'all') {
      return true
    }
    if (Array.isArray(level)) {
      return level.some((item) => (item === type || item === 'all'))
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
}

export default Logger
