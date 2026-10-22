import ora from 'ora'
import type { Ora } from 'ora'
import { LogConsoleStream } from '../../../types'
import type { IPicGo, IProgress } from '../../../types'
import type { IBuildInEvent } from '../../../utils/enum'
import { renderProgressBar } from '../../../utils/progressBar'

/**
 * Options for a generic CLI progress renderer.
 *
 * The renderer picks one of three modes:
 * - **TTY mode** — stdout is an interactive terminal AND `verbose=false`: ora spinner draws the
 *   progress bar in place (single line that updates).
 * - **Verbose mode** — `verbose=true`: each event prints a full line, suitable for log redirection
 *   or when the operator wants per-event history.
 * - **Non-TTY mode** — stdout is piped / CI: same as verbose, lines printed one at a time so
 *   downstream log capture isn't clobbered by spinner escape codes.
 *
 * The caller only provides two formatters: the inline label that follows the bar in TTY mode,
 * and the full line text used in verbose / non-TTY modes.
 */
export interface IProgressRendererOptions<TProgress extends IProgress> {
  ctx: IPicGo
  event: IBuildInEvent
  verbose: boolean
  /** Label appended after the progress bar in TTY mode. */
  formatBarText: (payload: TProgress) => string
  /** Full line text printed in verbose / non-TTY modes. */
  formatVerboseText: (payload: TProgress) => string
  /**
   * Stream for the per-event lines in verbose / non-TTY modes. Defaults to `LogConsoleStream.STDOUT`. Use `STDERR`
   * when stdout must only carry machine-readable output (e.g. `--format json`). The TTY spinner always writes to
   * stderr (ora's default) and is not affected.
   */
  lineStream?: LogConsoleStream
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
      const line = options.formatVerboseText(payload)
      if (options.lineStream === LogConsoleStream.STDERR) {
        console.error(line)
      } else {
        console.log(line)
      }
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
