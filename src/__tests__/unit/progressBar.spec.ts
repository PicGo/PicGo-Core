import { describe, expect, it } from 'vitest'
import { renderProgressBar } from '../../utils/progressBar'

describe('renderProgressBar', () => {
  it('renders all-empty when total is 0', () => {
    expect(renderProgressBar(0, 0)).toBe('░'.repeat(20))
    expect(renderProgressBar(5, 0)).toBe('░'.repeat(20))
  })

  it('renders all-filled when current >= total', () => {
    expect(renderProgressBar(10, 10)).toBe('█'.repeat(20))
    expect(renderProgressBar(15, 10)).toBe('█'.repeat(20))
  })

  it('renders half-filled at 50%', () => {
    expect(renderProgressBar(5, 10)).toBe('█'.repeat(10) + '░'.repeat(10))
  })

  it('handles negative current as 0%', () => {
    expect(renderProgressBar(-1, 10)).toBe('░'.repeat(20))
  })

  it('rounds intermediate values to nearest cell', () => {
    // 1/10 = 10% → 2 of 20 cells
    expect(renderProgressBar(1, 10)).toBe('█'.repeat(2) + '░'.repeat(18))
    // 7/10 = 70% → 14 of 20 cells
    expect(renderProgressBar(7, 10)).toBe('█'.repeat(14) + '░'.repeat(6))
  })

  it('always returns exactly 20-character string', () => {
    for (let i = 0; i <= 10; i++) {
      expect(renderProgressBar(i, 10).length).toBe(20)
    }
  })
})
