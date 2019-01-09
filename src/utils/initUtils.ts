import PicGo from '../core/PicGo'
import match from 'minimatch'

const generate = (ctx: PicGo, name: string, path: string, to: string, done: Function): void => {
  console.log(name, path, to, done)
  done('123')
}

/**
 * return the filters' result
 * @param ctx PicGo
 * @param exp condition expression
 * @param data options data
 */
const evaluate = (ctx: PicGo, exp: string, data: any): boolean | void => {
  const fn = new Function('data', 'with (data) { return ' + exp + '}')
  try {
    return fn(data)
  } catch (e) {
    ctx.log.error('Error when evaluating filter condition: ' + exp)
  }
}

const filters = (ctx: PicGo, files: any, filters: any, data: any): void => {
  if (!filters) {
    return
  }
  const fileNames = Object.keys(files)
  Object.keys(filters).forEach((glob: string) => {
    fileNames.forEach((file: string) => {
      if (match(file, glob, { dot: true })) {
        const condition = filters[glob]
        if (!evaluate(ctx, condition, data)) {
          delete files[file]
        }
      }
    })
  })
}

export {
  filters,
  generate
}
