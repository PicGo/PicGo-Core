import match from 'minimatch'
import { IPicGo, IOptions, IFileTree } from '../types'
import fs from 'fs-extra'
import path from 'path'
import globby from 'globby'
import ejs from 'ejs'

/**
 * Generate template files to destination files.
 * @param {PicGo} ctx
 * @param {IOptions} options
 */
const generate = async (ctx: IPicGo, options: IOptions): Promise<any> => {
  try {
    const opts = getOptions(options.tmp)
    const source = path.join(options.tmp, 'template')
    let answers = {}
    if (opts.prompts && opts.prompts.length > 0) {
      answers = await ctx.cmd.inquirer.prompt(opts.prompts)
    }
    let _files: string[] = await globby(['**/*'], { cwd: source, dot: true }) // get files' name array
    _files = _files.filter((item: string) => {
      let glob = ''
      Object.keys(opts.filters).forEach((key: string) => {
        if (match(item, key, { dot: true })) {
          glob = item
        }
      })
      if (glob) { // find a filter expression
        return filters(ctx, opts.filters[glob], answers)
      } else {
        return true
      }
    })
    if (_files.length === 0) {
      return ctx.log.warn('Template files not found!')
    }
    const files = render(_files, source, answers)
    writeFileTree(options.dest, files)
    if (typeof opts.complete === 'function') {
      opts.complete({ answers, options, files: _files, ctx })
    }
    if (opts.completeMessage) {
      ctx.log.success(opts.completeMessage)
    }
    ctx.log.success('Done!')
  } catch (e: any) {
    return ctx.log.error(e)
  }
}

/**
 * Return the filters' result
 * @param ctx PicGo
 * @param exp condition expression
 * @param data options data
 */
const filters = (ctx: IPicGo, exp: any, data: any): boolean => {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands, no-new-func, @typescript-eslint/no-implied-eval
  const fn = new Function('data', 'with (data) { return ' + exp + '}')
  try {
    return fn(data)
  } catch (e) {
    ctx.log.error(`Error when evaluating filter condition: ${JSON.stringify(exp)}`)
    return false
  }
}

/**
 * Get template options
 * @param {string} templatePath
 */
const getOptions = (templatePath: string): any => {
  const optionsPath = path.join(templatePath, 'index.js')
  if (fs.existsSync(optionsPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const options = require(optionsPath)
    return options
  } else {
    return {}
  }
}

/**
 * Render files to a virtual tree object
 * @param {array} files
 */
const render = (files: string[], source: string, options: any): any => {
  const fileTree: IFileTree = {}
  files.forEach((filePath: string): void => {
    const file = fs.readFileSync(path.join(source, filePath), 'utf8')
    const content = ejs.render(file, options)
    if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
      fileTree[filePath] = content
    }
  })
  return fileTree
}

/**
 * Write rendered files' content to real file
 * @param {string} dir
 * @param {object} files
 */
const writeFileTree = (dir: string, files: any): void => {
  Object.keys(files).forEach((name: string) => {
    const filePath = path.join(dir, name)
    fs.ensureDirSync(path.dirname(filePath))
    fs.writeFileSync(filePath, files[name])
  })
}

export {
  filters,
  generate,
  render,
  writeFileTree
}
