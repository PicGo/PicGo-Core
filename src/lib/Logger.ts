import chalk from 'chalk'
import PicGo from '../core/PicGo'

class Logger {
  level: {}
  ctx
  constructor (ctx: PicGo) {
    this.level = {
      success: 'green',
      info: 'blue',
      warn: 'yellow',
      error: 'red'
    }
    this.ctx = ctx
  }
  protected handleLog (type: string, msg: string | Error): string | Error | undefined {
    if (!this.ctx.config.silent) {
      let log = chalk[this.level[type]](`[PicGo ${type.toUpperCase()}]: `)
      log += msg
      console.log(log)
      return msg
    } else {
      return
    }
  }

  success (msg) {
    return this.handleLog('success', msg)
  }

  info (msg) {
    return this.handleLog('info', msg)
  }

  error (msg) {
    return this.handleLog('error', msg)
  }

  warn (msg) {
    return this.handleLog('warn', msg)
  }
}

export default Logger
