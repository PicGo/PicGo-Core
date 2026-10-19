import { afterEach, describe, expect, it } from 'vitest'

import {
  ALL_MOCK_SCENARIOS,
  buildMockOverview,
  buildMockUsage,
  getMockScenario
} from '../../lib/Cloud/__mocks__/lifecycleScenarios'
import type { MockLifecycleScenario } from '../../lib/Cloud/__mocks__/lifecycleScenarios'
import { CloudFixedTermSource, CloudSubscriptionStanding } from '../../types'

const NEW_SCENARIOS: MockLifecycleScenario[] = [
  'redemption-stacked',
  'redemption-stacked-long',
  'subscription-with-redemption',
  'subscription-ended-with-redemption',
  'subscription-pending'
]

const toMs = (iso: string): number => new Date(iso).getTime()

describe('lifecycle mock scenarios', () => {
  const originalEnv = process.env.PICGO_MOCK_LIFECYCLE

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PICGO_MOCK_LIFECYCLE
    } else {
      process.env.PICGO_MOCK_LIFECYCLE = originalEnv
    }
  })

  it.each(NEW_SCENARIOS)('getMockScenario accepts %s', (scenario) => {
    process.env.PICGO_MOCK_LIFECYCLE = scenario
    expect(getMockScenario()).toBe(scenario)
  })

  it('getMockScenario rejects unknown values', () => {
    process.env.PICGO_MOCK_LIFECYCLE = 'not-a-scenario'
    expect(getMockScenario()).toBeUndefined()
  })

  it.each([...ALL_MOCK_SCENARIOS])('%s keeps redemption timeline invariants', (scenario) => {
    const overview = buildMockOverview(scenario)
    const queue = overview.redemptionQueue
    const redemption = overview.fixedTerms.filter((term) => term.source === CloudFixedTermSource.Redemption)

    // 每种来源最多一条
    const sources = overview.fixedTerms.map((term) => term.source)
    expect(new Set(sources).size).toBe(sources.length)

    for (const segment of queue) {
      expect(toMs(segment.startsAt)).toBeLessThan(toMs(segment.endsAt))
    }
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i].startsAt).toBe(queue[i - 1].endsAt)
    }

    if (queue.length > 0) {
      expect(redemption).toHaveLength(1)
      expect(redemption[0].endsAt).toBe(queue[queue.length - 1].endsAt)
      // 当前段结束时间就是队列第一段的开始，必须在未来
      expect(toMs(queue[0].startsAt)).toBeGreaterThan(Date.now())
    }

    // lifecycle 终点是所有来源中最晚的结束时间
    const phaseEnd = overview.lifecycle.currentPhaseEndsAt
    if (overview.lifecycle.phase === 'active' && phaseEnd !== null) {
      for (const term of overview.fixedTerms) {
        expect(toMs(term.endsAt)).toBeLessThanOrEqual(toMs(phaseEnd))
      }
    }

    // pendingSubscription 只在没有生效中的订阅记录时出现
    if (overview.pendingSubscription !== null) {
      expect(
        overview.subscription === null || overview.subscription.standing === CloudSubscriptionStanding.Ended
      ).toBe(true)
    }
  })

  it.each([...ALL_MOCK_SCENARIOS])('%s usage plan matches overview', (scenario) => {
    const overview = buildMockOverview(scenario)
    const usage = buildMockUsage(scenario, 'gui')
    expect(usage.plan).toBe(overview.plan.paid)
  })

  it('redemption-stacked mirrors a 4-day max > pro > starter timeline', () => {
    const overview = buildMockOverview('redemption-stacked')
    expect(overview.fixedTerms[0]).toMatchObject({ plan: 'max', daysRemaining: 4 })
    expect(overview.redemptionQueue.map((segment) => segment.plan)).toEqual(['pro', 'starter'])
    expect(overview.subscription).toBeNull()
  })
})
