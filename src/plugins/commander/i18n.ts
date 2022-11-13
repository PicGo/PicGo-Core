import { IPlugin, IPicGo, IStringKeyMap } from '../../types'

const i18n: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('i18n')
      .arguments('[lang]')
      .description('change picgo language')
      .action(async (lang: string = '') => {
        const list = ctx.i18n.getLanguageList()
        if (!lang) {
          const prompts = [
            {
              type: 'list',
              name: 'i18n',
              choices: list,
              message: 'Choose a language',
              default: ctx.getConfig('settings.language') || 'zh-CN'
            }
          ]
          const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<string>>(prompts)
          ctx.i18n.setLanguage(answer.i18n)
          ctx.log.success(`Language set to ${answer.i18n}`)
          return
        }
        if (!list.includes(lang)) {
          return ctx.log.warn('No such language')
        }
        ctx.i18n.setLanguage(lang)
        ctx.log.success(`Language set to ${lang}`)
      })
  }
}

export default i18n
