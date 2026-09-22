import path from 'node:path'
import dayjs from 'dayjs'
import { CLIPBOARD_IMAGE_FOLDER } from './static'

export const createClipboardImagePath = (baseDir: string): string => {
  // Preserve the timestamp-only filename expected by existing PicGo integrations.
  return path.join(baseDir, CLIPBOARD_IMAGE_FOLDER, `${dayjs().format('YYYYMMDDHHmmssSSS')}.png`)
}
