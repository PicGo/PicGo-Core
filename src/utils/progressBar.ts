const PROGRESS_BAR_WIDTH = 20
const PROGRESS_FILLED = '█'
const PROGRESS_EMPTY = '░'

/**
 * Render a fixed 20-character progress bar (`█████░░░░░`).
 *
 * - `total <= 0` returns all-empty (`░ × 20`); the caller is responsible for any N/A label.
 * - `current >= total` returns all-filled (`█ × 20`); never overflows.
 * - Intermediate states round to the nearest cell based on `current / total`.
 *
 * Pure function with no external state — shared across the CLI (import progress, file
 * upload progress, future progress events).
 */
export const renderProgressBar = (current: number, total: number): string => {
  const ratio = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0
  const filled = Math.round(ratio * PROGRESS_BAR_WIDTH)
  const empty = PROGRESS_BAR_WIDTH - filled
  return PROGRESS_FILLED.repeat(filled) + PROGRESS_EMPTY.repeat(empty)
}
