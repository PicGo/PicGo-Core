import path from 'path'
import { spawn } from 'child_process'
import dayjs from 'dayjs'
import os from 'os'
import fs from 'fs-extra'
import isWsl from 'is-wsl'
import { IPicGo, IClipboardImage } from '../types'
import { IBuildInEvent } from './enum'

const getCurrentPlatform = (): string => {
  const platform = process.platform
  if (isWsl) {
    return 'wsl'
  }
  if (platform !== 'win32') {
    return platform
  } else {
    const currentOS = os.release().split('.')[0]
    if (currentOS === '10') {
      return 'win10'
    } else {
      return 'win32'
    }
  }
}

// Thanks to vs-picgo: https://github.com/Spades-S/vs-picgo/blob/master/src/extension.ts
const getClipboardImage = async (ctx: IPicGo): Promise<IClipboardImage> => {
  const imagePath = path.join(ctx.baseDir, `${dayjs().format('YYYYMMDDHHmmss')}.png`)
  return await new Promise<IClipboardImage>((resolve: Function): void => {
    const platform: string = getCurrentPlatform()
    let execution
    // for PicGo GUI
    const env = ctx.getConfig('PICGO_ENV') === 'GUI'
    const platformPaths: {
      [index: string]: string
    } = {
      darwin: env ? path.join(ctx.baseDir, 'mac.applescript') : './clipboard/mac.applescript',
      win32: env ? path.join(ctx.baseDir, 'windows.ps1') : './clipboard/windows.ps1',
      win10: env ? path.join(ctx.baseDir, 'windows10.ps1') : './clipboard/windows10.ps1',
      linux: env ? path.join(ctx.baseDir, 'linux.sh') : './clipboard/linux.sh',
      wsl: env ? path.join(ctx.baseDir, 'wsl.sh') : './clipboard/wsl.sh'
    }
    const scriptPath = env ? platformPaths[platform] : path.join(__dirname, platformPaths[platform])
    if (platform === 'darwin') {
      execution = spawn('osascript', [scriptPath, imagePath])
    } else if (platform === 'win32' || platform === 'win10') {
      execution = spawn('powershell', [
        '-noprofile',
        '-noninteractive',
        '-nologo',
        '-sta',
        '-executionpolicy', 'unrestricted',
        // fix windows 10 native cmd crash bug when "picgo upload"
        // https://github.com/PicGo/PicGo-Core/issues/32
        // '-windowstyle','hidden',
        // '-noexit',
        '-file', scriptPath,
        imagePath
      ])
    } else {
      execution = spawn('sh', [scriptPath, imagePath])
    }

    execution.stdout.on('data', (data: Buffer) => {
      if (platform === 'linux') {
        if (data.toString().trim() === 'no xclip') {
          return ctx.emit(IBuildInEvent.NOTIFICATION, {
            title: 'xclip not found',
            body: 'Please install xclip before run picgo'
          })
        }
      }
      const imgPath = data.toString().trim()
      let isExistFile = false
      // in macOS if your copy the file in system, it's basename will not equal to our default basename
      if (path.basename(imgPath) !== path.basename(imagePath)) {
        if (fs.existsSync(imgPath)) {
          isExistFile = true
        }
      }
      // emit if path does not exist
      if (fs.existsSync(imgPath)) {
        return ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: 'clipboard image path found does not exist',
          body: 'Please check system settings'
        })
      }
      resolve({
        imgPath,
        isExistFile
      })
    })
  })
}

export default getClipboardImage
