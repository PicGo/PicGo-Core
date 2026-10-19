import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingService } from '../../lib/Cloud/services/BillingService'
import {
  CloudFixedTermSource,
  CloudSubscriptionStanding
} from '../../types'
import type { CloudBillingOverview, IPicGo } from '../../types'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn()
}))

vi.mock('../../lib/Cloud/Request', () => ({
  AuthRequestClient: class {
    request = requestMock
  }
}))

const createCtx = (): IPicGo => {
  return {
    log: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn()
    }
  } as unknown as IPicGo
}

const basePayload = {
  plan: {
    paid: 'pro',
    capability: 'pro',
    billingPeriod: 'monthly',
    source: 'both' as const
  },
  lifecycle: {
    phase: 'active' as const,
    daysRemaining: null,
    graceEndsAt: null,
    freezeEndsAt: null,
    currentPhaseEndsAt: '2026-12-01T00:00:00.000Z',
    flags: {
      customDomainDisabledByLifecycle: false,
      autoImportDisabledByLifecycle: false
    }
  },
  subscription: {
    status: 'active',
    currentPeriodEnd: '2026-11-19T00:00:00.000Z'
  }
}

describe('BillingService.getOverview', () => {
  let originalMockLifecycle: string | undefined

  beforeEach(() => {
    originalMockLifecycle = process.env.PICGO_MOCK_LIFECYCLE
    delete process.env.PICGO_MOCK_LIFECYCLE
    requestMock.mockReset()
  })

  afterEach(() => {
    if (originalMockLifecycle === undefined) {
      delete process.env.PICGO_MOCK_LIFECYCLE
    } else {
      process.env.PICGO_MOCK_LIFECYCLE = originalMockLifecycle
    }
  })

  it('passes through stacked-term fields from a new server unchanged', async () => {
    const payload: CloudBillingOverview = {
      ...basePayload,
      plan: {
        ...basePayload.plan,
        subscription: 'basic'
      },
      subscription: {
        ...basePayload.subscription,
        standing: CloudSubscriptionStanding.Ending
      },
      redemptionQueue: [
        {
          plan: 'basic',
          startsAt: '2026-12-01T00:00:00.000Z',
          endsAt: '2027-01-01T00:00:00.000Z'
        }
      ],
      fixedTerms: [
        {
          source: CloudFixedTermSource.Redemption,
          plan: 'pro',
          endsAt: '2027-01-01T00:00:00.000Z',
          daysRemaining: 74
        }
      ],
      pendingSubscription: { plan: 'pro' }
    }
    requestMock.mockResolvedValue({ success: true, data: payload })

    const service = new BillingService(createCtx())
    const overview = await service.getOverview('token')

    expect(requestMock).toHaveBeenCalledWith({ method: 'GET', url: '/api/billing/me' }, 'token')
    expect(overview).toEqual(payload)
    expect(overview.plan.subscription).toBe('basic')
    expect(overview.subscription?.standing).toBe(CloudSubscriptionStanding.Ending)
  })

  it('defaults missing stacked-term fields when talking to an old server', async () => {
    requestMock.mockResolvedValue({ success: true, data: basePayload })

    const service = new BillingService(createCtx())
    const overview = await service.getOverview()

    expect(overview.redemptionQueue).toEqual([])
    expect(overview.fixedTerms).toEqual([])
    expect(overview.pendingSubscription).toBeNull()
    expect(overview.plan).toEqual(basePayload.plan)
    expect(overview.lifecycle).toEqual(basePayload.lifecycle)
    expect(overview.subscription).toEqual(basePayload.subscription)
    expect(overview.plan.subscription).toBeUndefined()
    expect(overview.subscription?.standing).toBeUndefined()
  })
})
