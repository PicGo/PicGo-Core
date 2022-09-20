import { ZH_CN, ILocalesKey, ILocales } from './zh-CN'
import { merge } from 'lodash'
import { IPicGo } from '../types'
import path from 'path'
import fs from 'fs-extra'
import yaml from 'js-yaml'

import { ObjectAdapter, I18n } from '@picgo/i18n'
import { IStringKeyMap, II18nManager } from '../types/index'
import { ILocale } from '@picgo/i18n/dist/types'
import { EN } from './en'
import { ZH_TW } from './zh-TW'

const languageList: IStringKeyMap<IStringKeyMap<string>> = {
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TW,
  en: EN
}

class I18nManager implements II18nManager {
  private readonly i18n: I18n
  private readonly objectAdapter: ObjectAdapter
  private readonly ctx: IPicGo
  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.objectAdapter = new ObjectAdapter(languageList)
    let language = this.ctx.getConfig<string>('settings.language') || 'zh-CN'
    if (!languageList[language]) {
      language = 'zh-CN' // use default
    }
    this.i18n = new I18n({
      adapter: this.objectAdapter,
      defaultLanguage: language
    })
    this.loadOutterI18n()
  }

  private loadOutterI18n (): void {
    const i18nFolder = this.getOutterI18nFolder()
    const files = fs.readdirSync(i18nFolder, {
      withFileTypes: true
    })
    files.forEach(file => {
      if (file.isFile() && file.name.endsWith('.yml')) {
        const i18nFilePath = path.join(i18nFolder, file.name)
        const i18nFile = fs.readFileSync(i18nFilePath, 'utf8')
        try {
          const i18nFileObj = yaml.load(i18nFile) as ILocales
          languageList[file.name.replace(/\.yml$/, '')] = i18nFileObj
        } catch (e) {
          console.error(e)
        }
      }
    })
  }

  private getOutterI18nFolder (): string {
    const i18nFolder = path.join(this.ctx.baseDir, 'i18n-cli')
    if (!fs.pathExistsSync(i18nFolder)) {
      fs.ensureDirSync(i18nFolder)
    }
    return i18nFolder
  }

  translate<T extends string>(key: ILocalesKey | T, args?: IStringKeyMap<string>): string {
    return this.i18n.translate(key, args) || key
  }

  setLanguage (language: string): void {
    this.i18n.setLanguage(language)
    this.ctx.saveConfig({
      'settings.language': language
    })
  }

  addLocale (language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (!originLocales) {
      return false
    }
    const newLocales = merge(originLocales, locales)
    this.objectAdapter.setLocale(language, newLocales)
    return true
  }

  addLanguage (language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (originLocales) {
      return false
    }
    this.objectAdapter.setLocale(language, locales)
    languageList[language] = locales
    return true
  }

  getLanguageList (): string[] {
    return Object.keys(languageList)
  }
}

export {
  I18nManager
}
