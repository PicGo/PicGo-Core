import chalk from 'chalk'
import PicGo from '../core/PicGo'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import path from 'path'
import util from 'util'
import { ILogType } from '../utils/enum'
import {
  ILogArgvType,
  ILogArgvTypeWithError
} from '../utils/interfaces'

class Logger {
  private level = {
    [ILogType.success]: 'green',
    [ILogType.info]: 'blue',
    [ILogType.warn]: 'yellow',
    [ILogType.error]: 'red'
  }
  private ctx: PicGo
  private logLevel: string
  private logPath: string
  constructor (ctx: PicGo) {
    this.ctx = ctx
  }
  private handleLog (type: ILogType, ...msg: ILogArgvTypeWithError[]): void {
    // if configPath is invalid then this.ctx.config === undefined
    // if not then check config.silent
    if (this.ctx.getConfig() === undefined || !this.ctx.getConfig('silent')) {
      const logHeader = chalk[this.level[type]](`[PicGo ${type.toUpperCase()}]:`)
      console.log(logHeader, ...msg)
      this.logLevel = this.ctx.getConfig('settings.logLevel')
      const logPath = this.checkLogPathChange()
      // The incoming logPath is a value
      // lock the path with a closure
      setTimeout(() => {
        this.handleWriteLog(logPath, type, ...msg)
      }, 0)
    } else {
      return
    }
  }

  private checkLogPathChange (): string {
    const logPath = this.ctx.getConfig('settings.logPath') || path.join(this.ctx.baseDir, './picgo.log')
    if (logPath !== this.logPath) {
      this.logPath = logPath
    }
    return logPath
  }

  private handleWriteLog (logPath: string, type: string, ...msg: ILogArgvTypeWithError[]): void {
    try {
      if (this.checkLogLevel(type, this.logLevel)) {
        let log = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicGo ${type.toUpperCase()}] `
        msg.forEach((item: ILogArgvTypeWithError) => {
          if (typeof item === 'object' && type === 'error') {
            log += `\n------Error Stack Begin------\n${util.format(item.stack)}\n-------Error Stack End------- `
          } else {
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
}

export default Logger
