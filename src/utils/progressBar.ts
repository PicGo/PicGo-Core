const PROGRESS_BAR_WIDTH = 20
const PROGRESS_FILLED = '█'
const PROGRESS_EMPTY = '░'

/**
 * 渲染一个固定 20 字符宽的进度条（`█████░░░░░`）。
 *
 * - `total <= 0` 时输出全空（`░ × 20`）；调用方需自己处理 N/A 文案。
 * - `current >= total` 时输出全实（`█ × 20`），不会越界。
 * - 中间状态按 `current / total` 比例四舍五入填充。
 *
 * 纯函数、零外部状态，CLI 各处（import 进度、文件上传进度等）通用。
 */
export const renderProgressBar = (current: number, total: number): string => {
  const ratio = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0
  const filled = Math.round(ratio * PROGRESS_BAR_WIDTH)
  const empty = PROGRESS_BAR_WIDTH - filled
  return PROGRESS_FILLED.repeat(filled) + PROGRESS_EMPTY.repeat(empty)
}
