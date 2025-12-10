import { readFileSync, existsSync } from 'node:fs'
import { builtinModules } from 'node:module'
import terser from '@rollup/plugin-terser'

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import typescript from '@rollup/plugin-typescript'
import copy from 'rollup-plugin-copy'
import { string } from 'rollup-plugin-string'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const version = process.env.VERSION || pkg.version
const sourcemap = true
const banner = `/*
 * picgo@${version}, https://github.com/PicGo/PicGo-Core
 * (c) 2018-${new Date().getFullYear()} PicGo Group
 * Released under the MIT License.
 */`
const input = './src/index.ts'

const external = [
  ...(Object.keys(pkg.dependencies || {}).map(packageName => new RegExp(`^${packageName}(/.*)?`))),
  ...builtinModules.map(moduleName => new RegExp(`^(node:)?${moduleName}(/.*)?`))
]

const plugins = [
  typescript({ tsconfig: './tsconfig.json' }),
  commonjs(),
  nodeResolve({ preferBuiltins: true }),
  string({
    include: ['**/*.applescript', '**/*.ps1', '**/*.sh']
  }),
  json(),
  replace({
    'process.env.PICGO_VERSION': JSON.stringify(pkg.version),
    preventAssignment: true
  })
]

if (existsSync('assets')) {
  plugins.splice(1, 0, copy({ targets: [{ src: 'assets', dest: 'dist' }] }))
}

const isDev = process.env.NODE_ENV === 'development'
const commonOptions = {
  external,
  plugins,
  input
}

if (!isDev) {
  commonOptions.plugins.push(terser())
}

/** @type import('rollup').RollupOptions[] */
const bundles = [
  {
    output: [{
      file: 'dist/index.cjs.js',
      format: 'cjs',
      banner,
      sourcemap
    }],
    ...commonOptions
  },
  {
    output: [{
      file: 'dist/index.esm.js',
      format: 'esm',
      banner,
      sourcemap
    }],
    ...commonOptions
  }
]

export default bundles
