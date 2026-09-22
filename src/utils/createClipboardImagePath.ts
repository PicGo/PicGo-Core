import path from 'node:path'
import dayjs from 'dayjs'
import { CLIPBOARD_IMAGE_FOLDER } from './static'
import { uuid } from './uuid'

export const createClipboardImagePath = (baseDir: string): string => {
  return path.join(baseDir, CLIPBOARD_IMAGE_FOLDER, `${dayjs().format('YYYYMMDDHHmmssSSS')}-${uuid()}.png`)
}
