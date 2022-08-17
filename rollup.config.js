import { terser } from 'rollup-plugin-terser'
import pkg from './package.json'
import typescript from 'rollup-plugin-typescript2'
import commonjs from '@rollup/plugin-commonjs'
import { string } from 'rollup-plugin-string'
import json from '@rollup/plugin-json'
import builtins from 'builtins'
import replace from '@rollup/plugin-replace'
const version = process.env.VERSION || pkg.version
const sourcemap = 'inline'
const banner = `/*
 * picgo@${version}, https://github.com/PicGo/PicGo-Core
 * (c) 2018-${new Date().getFullYear()} PicGo Group
 * Released under the MIT License.
 */`
const input = './src/index.ts'

const commonOptions = {
  // Creating regex of the packages to make sure sub-paths of the
  // packages such as `lowdb/adapters/FileSync` are also treated as external
  // See https://github.com/rollup/rollup/issues/3684#issuecomment-926558056
  external: [
    ...Object.keys(pkg.dependencies),
    ...builtins()
  ].map(packageName => new RegExp(`^${packageName}(/.*)?`)),
  plugins: [
    typescript({
      tsconfigOverride: {
        compilerOptions: {
          target: 'ES2017',
          module: 'ES2015'
        }
      }
    }),
    // terser(),
    commonjs(),
    string({
      // Required to be specified
      include: [
        '**/*.applescript',
        '**/*.ps1',
        '**/*.sh'
      ]
    }),
    json(),
    replace({
      'process.env.PICGO_VERSION': JSON.stringify(pkg.version),
      preventAssignment: true
    })
  ],
  input
}

const isDev = process.env.NODE_ENV === 'development'

if (!isDev) {
  commonOptions.plugins.push(terser())
}

/** @type import('rollup').RollupOptions */
const nodeCjs = {
  output: [{
    file: 'dist/index.cjs.js',
    format: 'cjs',
    banner,
    sourcemap
  }],
  ...commonOptions
}

const nodeEsm = {
  output: [{
    file: 'dist/index.esm.js',
    format: 'esm',
    banner,
    sourcemap
  }],
  ...commonOptions
}

const bundles = []
const env = process.env.BUNDLES || ''
if (env.includes('cjs')) bundles.push(nodeCjs)
if (env.includes('esm')) bundles.push(nodeEsm)
if (bundles.length === 0) bundles.push(nodeCjs, nodeEsm)

export default bundles
