import PicGo from '../core/PicGo'
import path from 'path'
import { spawn } from 'child_process'
import dayjs from 'dayjs'

// Thanks to vs-picgo: https://github.com/Spades-S/vs-picgo/blob/master/src/extension.ts
const getClipboardImage = (ctx: PicGo): Promise<tring> => {
  const imagePath = path.join(ctx.baseDir, `${dayjs().format('YYYYMMDDHHmmss')}.png`)
  return new Promise((resolve: any, reject: any): any => {
    let platform: string = process.platform
    let execution = null
    const platformPaths: {
      [index: string]: string
    } = {
      'darwin': './clipboard/mac.applescript',
      'win32': './clipboard/windows.ps1',
      'linux': './clipboard/linux.sh'
    }
    const scriptPath = path.join(__dirname, platformPaths[platform])
    if (platform === 'darwin') {
      execution = spawn('osascript', [scriptPath, imagePath])

    } else if (platform === 'win32') {
      execution = spawn('powershell', [
        '-noprofile',
        '-noninteractive',
        '-nologo',
        '-sta',
        '-executionpolicy', 'unrestricted',
        '-windowstyle', 'hidden',
        '-file', scriptPath,
        imagePath
      ])
    } else {
      execution = spawn('sh', [scriptPath, imagePath])
    }

    execution.stdout.on('data', (data: Buffer) => {
      if (platform === 'linux') {
        if (data.toString().trim() === 'no xclip') {
          ctx.emit('notification', {
            title: 'xclip not found',
            body: 'Please install xclip before run picgo!'
          })
        } else {
          resolve(data.toString().trim())
        }
      } else {
        resolve(data.toString().trim())
      }
    })
    execution.stderr.on('data', (err: any) => {
      reject(err)
    })
  })
}

export default getClipboardImage
