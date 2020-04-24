import chalk from 'chalk'
import PicGo from '../core/PicGo'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import path from 'path'
import util from 'util'
import { ILogType } from '../utils/enum'

class Logger {
  private level = {
    success: ILogType.success,
    info: ILogType.info,
    warn: ILogType.warn,
    error: ILogType.error
  }
  private ctx: PicGo
  private logger: Console
  private logLevel: string
  private logPath: string
  constructor (ctx: PicGo) {
    this.ctx = ctx
  }
  protected handleLog (type: ILogType, msg: string | Error): string | Error | undefined {
    // if configPath is invalid then this.ctx.config === undefined
    // if not then check config.silent
    if (this.ctx.getConfig() === undefined || !this.ctx.getConfig('silent')) {
      let log = chalk[this.level[type]](`[PicGo ${type.toUpperCase()}]: `)
      log += msg
      console.log(log)
      this.logLevel = this.ctx.getConfig('settings.logLevel')
      this.logPath = this.ctx.getConfig('settings.logPath') || path.join(this.ctx.baseDir, './picgo.log')
      setTimeout(() => {
        this.handleWriteLog(type, msg)
      }, 0)
      return msg
    } else {
      return
    }
  }

  protected handleWriteLog (type: string, msg: string | Error): void {
    try {
      if (this.checkLogLevel(type, this.logLevel)) {
        const picgoLog = fs.createWriteStream(this.logPath, { flags: 'a', encoding: 'utf8' })
        let log = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicGo ${type.toUpperCase()}] ${msg}`
        let logger = new console.Console(picgoLog)
        if (typeof msg === 'object' && type === 'error') {
          log += `\n------Error Stack Begin------\n${util.format(msg.stack)}\n-------Error Stack End-------`
        }
        logger.log(log)
        picgoLog.destroy()
        logger = null
      }
    } catch (e) {
      console.log(e)
    }
  }

  protected checkLogLevel (type: string, level: undefined | string | string[]): boolean {
    if (level === undefined || level === 'all') {
      return true
    }
    if (Array.isArray(level)) {
      return level.some((item: string) => (item === type || item === 'all'))
    } else {
      return type === level
    }
  }

  success (msg: string | Error): string | Error | undefined {
    return this.handleLog(ILogType.success, msg)
  }

  info (msg: string | Error): string | Error | undefined {
    return this.handleLog(ILogType.info, msg)
  }

  error (msg: string | Error): string | Error | undefined {
    return this.handleLog(ILogType.error, msg)
  }

  warn (msg: string | Error): string | Error | undefined {
    return this.handleLog(ILogType.error, msg)
  }
}

export default Logger
