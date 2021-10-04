/* eslint-disable no-console */
// We use .mjs because globby package now is pure-esm, and can only be imported in esm mode, because this is a simple build script and we do not want to bother run esm-to-cjs build process, we just change our build script to esm
// We cannot use "type": "module" in package.json because VSCode supports cjs modules only at the present
import esbuild from 'esbuild'
import fse from 'fs-extra'
import minimist from 'minimist'
import path from 'path'
import execa from 'execa'
import pkg from './package.json'

const args = minimist(process.argv.slice(2))
const isWatch = args.watch || args.w
const isProduction = args.production

// Following the log format of https://github.com/connor4312/esbuild-problem-matchers
const status = (msg) => console.log(`${isWatch ? '[watch] ' : ''}${msg}`)

const firstBuildFinished = new Set()
let buildStartTime

/** @type {import('esbuild').Plugin} */
const watchPlugin = (type) => ({
  name: 'watcher',
  setup (build) {
    build.onStart(() => {
      buildStartTime = Date.now()
      status(`${type} build started.`)
    })
    build.onEnd((result) => {
      result.errors.forEach((error) =>
        console.error(
          `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
        )
      )
      firstBuildFinished.add(type)
      status(`${type} build finished in ${Date.now() - buildStartTime} ms.`)
      if (firstBuildFinished.size === 2) {
        // esbuild problem matcher extension is listening for this log, once this is logged, it will open the Extension Host
        // So we have to assure only printing this when both extension and webview have been built
        status(`build finished in ${Date.now() - buildStartTime} ms.`)
      }
    })
  }
})
const resultHandler = async (result) => {
  result.metafile &&
    console.log(
      await esbuild.analyzeMetafile(result.metafile, {
        verbose: true
      })
    )
}

const outdir = './dist'

// clean old built files
fse.rmdirSync(outdir, { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const commonOptions = {
  bundle: true,
  sourcemap: isProduction ? false : 'inline',
  watch: isWatch,
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"'
  },
  minify: isProduction,
  entryPoints: ['src/index.ts'],
  platform: 'node',
  external: [
    ...Object.keys(pkg.dependencies),
    'path',
    'events',
    'os',
    'util',
    'child_process',
    'lowdb/adapters/FileSync',
    'url',
    'crypto',
    'mime-types',
    'electron'
  ],
  mainFields: ['module', 'main']
  // metafile: true,
}

esbuild
  .build({
    ...commonOptions,
    outfile: path.join(outdir, 'index.cjs.js'),
    entryPoints: ['src/index.ts'],
    format: 'cjs',
    plugins: [watchPlugin('picgo cjs')]
  })
  .then(resultHandler)
  .catch(() => {
    process.exit(1)
  })

esbuild
  .build({
    ...commonOptions,
    outfile: path.join(outdir, 'index.esm.js'),
    format: 'esm',
    plugins: [watchPlugin('picgo esm')]
  })
  .then(resultHandler)
  .catch(() => {
    process.exit(1)
  })

// copy clipboard scripts
fse.copy('src/utils/clipboard', `${outdir}/clipboard`, {
  overwrite: true
})

// Generating types
execa('yarn', ['tsc', '--emitDeclarationOnly'], { stdio: 'inherit' })
