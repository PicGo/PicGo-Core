import type { IImgInfo, II18nManager, IUrlRewriteRule, Undefinable } from '../types'
import type { ILocalesKey } from '../i18n/zh-CN'

export interface IUrlRewriteLogger {
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
}

const compileRuleRegExp = (rule: IUrlRewriteRule): RegExp => {
  const flags = `${rule.global === true ? 'g' : ''}${rule.ignoreCase === true ? 'i' : ''}`
  return new RegExp(rule.match, flags)
}

export const applyUrlRewriteToImgInfo = (imgInfo: IImgInfo, rules: IUrlRewriteRule[], ctx: { log: IUrlRewriteLogger, i18n?: II18nManager }): void => {
  if (!imgInfo.imgUrl) return

  for (const rule of rules) {
    const enabled = rule.enable !== false
    if (!enabled) continue

    let regex: RegExp
    try {
      regex = compileRuleRegExp(rule)
    } catch (e: any) {
      ctx.log.error(e)
      continue
    }

    if (!regex.test(imgInfo.imgUrl)) continue

    const originalUrl = imgInfo.imgUrl
    const nextUrl = originalUrl.replace(regex, rule.replace)

    if (nextUrl !== originalUrl && typeof imgInfo.originImgUrl === 'undefined') {
      imgInfo.originImgUrl = originalUrl
    }

    imgInfo.imgUrl = nextUrl

    if (nextUrl === '') {
      const warnMsg = ctx.i18n?.translate<ILocalesKey>('URL_REWRITE_EMPTY_RESULT') ?? 'URL_REWRITE_EMPTY_RESULT'
      ctx.log.warn(warnMsg)
    }

    // First Match Wins
    break
  }
}

export const applyUrlRewriteToOutput = (ctx: { getConfig: (name?: string) => any, log: IUrlRewriteLogger, output: IImgInfo[], i18n?: II18nManager }): void => {
  const rules = ctx.getConfig('settings.urlRewrite.rules') as Undefinable<IUrlRewriteRule[]>
  if (!Array.isArray(rules) || rules.length === 0) return

  for (const imgInfo of ctx.output) {
    applyUrlRewriteToImgInfo(imgInfo, rules, ctx)
  }
}
