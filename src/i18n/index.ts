import { ZH_CN, ILocalesKey } from './zh-CN'
import { merge } from 'lodash'

import { ObjectAdapter, I18n } from '@picgo/i18n'
import { IStringKeyMap, II18nManager } from '../types/index'
import { ILocale } from '@picgo/i18n/dist/types'

const languageList = {
  'zh-CN': ZH_CN
}

class I18nManager implements II18nManager {
  private readonly i18n: I18n
  private readonly objectAdapter: ObjectAdapter
  constructor () {
    this.objectAdapter = new ObjectAdapter(languageList)
    this.i18n = new I18n({
      adapter: this.objectAdapter,
      defaultLanguage: 'zh-CN'
    })
  }

  translate<T extends string>(key: ILocalesKey | T, args?: IStringKeyMap<string>): string {
    return this.i18n.translate(key, args) || ''
  }

  setLanguage (language: string): void {
    this.i18n.setLanguage(language)
  }

  /**
   * add locale to current i18n language
   * default locale list
   * - zh-CN
   * - en
   */
  addLocale (language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (!originLocales) {
      return false
    }
    const newLocales = merge(originLocales, locales)
    this.objectAdapter.setLocale(language, newLocales)
    return true
  }
}

const i18nManager = new I18nManager()

export {
  i18nManager
}
