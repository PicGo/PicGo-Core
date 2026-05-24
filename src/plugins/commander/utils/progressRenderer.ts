import ora from 'ora'
import type { Ora } from 'ora'
import type { IPicGo, IProgress } from '../../../types'
import type { IBuildInEvent } from '../../../utils/enum'
import { renderProgressBar } from '../../../utils/progressBar'

/**
 * 创建一个通用 CLI 进度 renderer 的参数。
 *
 * 三种渲染模式按以下规则切换：
 * - **TTY 模式**：terminal 是交互式终端且 verbose=false → 用 ora spinner 滚动渲染进度条。
 * - **Verbose 模式**：verbose=true → 每次事件输出一行完整 verbose 文本，便于日志重定向时按行读。
 * - **非 TTY 模式**：stdout 不是 TTY（被管道接走 / CI 环境）→ 等同 verbose 模式，逐行输出。
 *
 * 调用方只负责提供两个 formatter：进度条标签（TTY 模式拼在进度条右侧）和 verbose 行文本。
 */
export interface IProgressRendererOptions<TProgress extends IProgress> {
  ctx: IPicGo
  event: IBuildInEvent
  verbose: boolean
  /** TTY 模式下进度条右侧拼接的标签 */
  formatBarText: (payload: TProgress) => string
  /** verbose / 非 TTY 模式下逐行输出的完整文本 */
  formatVerboseText: (payload: TProgress) => string
}

export interface IProgressRendererHandle {
  spinner: Ora
  dispose: () => void
}

export const createProgressRenderer = <TProgress extends IProgress>(
  options: IProgressRendererOptions<TProgress>
): IProgressRendererHandle => {
  const spinner = ora({ text: '' })
  const useVerbose = options.verbose || !process.stdout.isTTY

  const listener = (payload: TProgress): void => {
    if (useVerbose) {
      if (spinner.isSpinning) {
        spinner.stop()
      }
      console.log(options.formatVerboseText(payload))
      return
    }

    const bar = renderProgressBar(payload.current, payload.total)
    spinner.text = `${bar} ${options.formatBarText(payload)}`
    if (!spinner.isSpinning) {
      spinner.start()
    }
  }

  options.ctx.on(options.event, listener)

  return {
    spinner,
    dispose: () => {
      options.ctx.off(options.event, listener)
      if (spinner.isSpinning) {
        spinner.stop()
      }
    }
  }
}
