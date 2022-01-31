import { ZH_CN, ILocalesKey } from './zh-CN'
import { merge } from 'lodash'
import { IPicGo } from '../types'

import { ObjectAdapter, I18n } from '@picgo/i18n'
import { IStringKeyMap, II18nManager } from '../types/index'
import { ILocale } from '@picgo/i18n/dist/types'
import { EN } from './en'

const languageList: IStringKeyMap<IStringKeyMap<string>> = {
  'zh-CN': ZH_CN,
  en: EN
}

class I18nManager implements II18nManager {
  private readonly i18n: I18n
  private readonly objectAdapter: ObjectAdapter
  private readonly ctx: IPicGo
  constructor (ctx: IPicGo) {
    this.ctx = ctx
    this.objectAdapter = new ObjectAdapter(languageList)
    const language = this.ctx.getConfig<string>('settings.language') || 'zh-CN'
    this.i18n = new I18n({
      adapter: this.objectAdapter,
      defaultLanguage: language
    })
  }

  translate<T extends string>(key: ILocalesKey | T, args?: IStringKeyMap<string>): string {
    return this.i18n.translate(key, args) || ''
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
