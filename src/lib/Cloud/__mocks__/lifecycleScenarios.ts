import { CloudFixedTermSource, CloudSubscriptionStanding } from '../../../types'
import type { CloudBillingOverview, CloudLifecycleFlags, CloudUsage, ICloudUserInfo } from '../../../types'

/**
 * 本文件用于本地开发 / QA 验收 lifecycle v2 UI 表现，不参与线上逻辑。
 * 通过环境变量 `PICGO_MOCK_LIFECYCLE=<scenario>` 启用。
 *
 * 使用方式（PicGo desktop 主进程会读到 process.env）：
 *   PICGO_MOCK_LIFECYCLE=grace pnpm dev
 *
 * 可选值：active-pro | active-pro-yearly | active-pro-cancel | active-grant | active-grant-lifetime | grace | frozen | pending-cleanup | redemption-stacked | redemption-stacked-long | subscription-with-redemption | subscription-ended-with-redemption | subscription-pending
 * 取消 mock：unset PICGO_MOCK_LIFECYCLE
 */
export type MockLifecycleScenario =
  | 'active-pro'
  | 'active-pro-yearly'
  | 'active-pro-cancel'
  | 'active-grant'
  | 'active-grant-lifetime'
  | 'grace'
  | 'frozen'
  | 'pending-cleanup'
  | 'redemption-stacked'
  | 'redemption-stacked-long'
  | 'subscription-with-redemption'
  | 'subscription-ended-with-redemption'
  | 'subscription-pending'

export const ALL_MOCK_SCENARIOS: readonly MockLifecycleScenario[] = [
  'active-pro',
  'active-pro-yearly',
  'active-pro-cancel',
  'active-grant',
  'active-grant-lifetime',
  'grace',
  'frozen',
  'pending-cleanup',
  'redemption-stacked',
  'redemption-stacked-long',
  'subscription-with-redemption',
  'subscription-ended-with-redemption',
  'subscription-pending'
]

const isMockScenario = (value: string): value is MockLifecycleScenario =>
  (ALL_MOCK_SCENARIOS as readonly string[]).includes(value)

export function getMockScenario (): MockLifecycleScenario | undefined {
  const value = process.env.PICGO_MOCK_LIFECYCLE
  if (!value) return undefined
  return isMockScenario(value) ? value : undefined
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 同一个 overview 内的所有时间点都基于同一个 now 计算，保证兑换段首尾严格相接。 */
const createIsoIn = (now: number) => (days: number): string =>
  new Date(now + days * DAY_MS).toISOString()

const ACTIVE_FLAGS: CloudLifecycleFlags = { customDomainDisabledByLifecycle: false, autoImportDisabledByLifecycle: false }
const DISABLED_FLAGS: CloudLifecycleFlags = { customDomainDisabledByLifecycle: true, autoImportDisabledByLifecycle: true }

const NO_FIXED_TERM_FIELDS: Pick<CloudBillingOverview, 'redemptionQueue' | 'fixedTerms' | 'pendingSubscription'> = {
  redemptionQueue: [],
  fixedTerms: [],
  pendingSubscription: null
}

export function buildMockOverview (scenario: MockLifecycleScenario): CloudBillingOverview {
  const isoIn = createIsoIn(Date.now())
  switch (scenario) {
    case 'active-pro':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', subscription: 'pro', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 20,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(20),
          flags: ACTIVE_FLAGS
        },
        subscription: { status: 'active', standing: CloudSubscriptionStanding.Live, currentPeriodEnd: isoIn(20) },
        ...NO_FIXED_TERM_FIELDS
      }
    case 'active-pro-yearly':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'yearly', subscription: 'pro', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 180,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(180),
          flags: ACTIVE_FLAGS
        },
        subscription: { status: 'active', standing: CloudSubscriptionStanding.Live, currentPeriodEnd: isoIn(180) },
        ...NO_FIXED_TERM_FIELDS
      }
    case 'active-pro-cancel':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', subscription: 'pro', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 20,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(20),
          flags: ACTIVE_FLAGS
        },
        subscription: { status: 'scheduled_cancel', standing: CloudSubscriptionStanding.Ending, currentPeriodEnd: isoIn(20) },
        ...NO_FIXED_TERM_FIELDS
      }
    case 'active-grant':
      return {
        plan: { paid: 'free', capability: 'pro', billingPeriod: null, source: 'admin_grant' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 30,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(30),
          flags: ACTIVE_FLAGS
        },
        subscription: null,
        redemptionQueue: [],
        fixedTerms: [{ source: CloudFixedTermSource.Admin, plan: 'pro', endsAt: isoIn(30), daysRemaining: 30 }],
        pendingSubscription: null
      }
    case 'active-grant-lifetime':
      // 永久赠送没有结束时间，CloudFixedTerm.endsAt 必填，因此不出现在 fixedTerms 里。
      return {
        plan: { paid: 'free', capability: 'pro', billingPeriod: null, source: 'admin_grant' },
        lifecycle: {
          phase: 'active',
          daysRemaining: null,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: null,
          flags: ACTIVE_FLAGS
        },
        subscription: null,
        ...NO_FIXED_TERM_FIELDS
      }
    case 'grace':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', source: 'entitlement' },
        lifecycle: {
          phase: 'grace',
          daysRemaining: 30,
          graceEndsAt: isoIn(30),
          freezeEndsAt: isoIn(90),
          currentPhaseEndsAt: isoIn(30),
          flags: DISABLED_FLAGS
        },
        subscription: { status: 'past_due', standing: CloudSubscriptionStanding.Ended, currentPeriodEnd: isoIn(-3) },
        ...NO_FIXED_TERM_FIELDS
      }
    case 'frozen':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', source: 'entitlement' },
        lifecycle: {
          phase: 'frozen',
          daysRemaining: 60,
          graceEndsAt: isoIn(-30),
          freezeEndsAt: isoIn(60),
          currentPhaseEndsAt: isoIn(60),
          flags: DISABLED_FLAGS
        },
        subscription: { status: 'canceled', standing: CloudSubscriptionStanding.Ended, currentPeriodEnd: isoIn(-30) },
        ...NO_FIXED_TERM_FIELDS
      }
    case 'pending-cleanup':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', source: 'entitlement' },
        lifecycle: {
          phase: 'pending_cleanup',
          daysRemaining: null,
          graceEndsAt: isoIn(-90),
          freezeEndsAt: isoIn(-30),
          currentPhaseEndsAt: null,
          flags: DISABLED_FLAGS
        },
        subscription: null,
        ...NO_FIXED_TERM_FIELDS
      }
    case 'redemption-stacked':
      // 对应 portal 截图：当前 max 剩 1 天，之后 pro 1 天、starter 2 天，总计 4 天，「即将到期」。
      return {
        plan: { paid: 'max', capability: 'max', billingPeriod: null, source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 4,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(4),
          flags: ACTIVE_FLAGS
        },
        subscription: null,
        redemptionQueue: [
          { plan: 'pro', startsAt: isoIn(1), endsAt: isoIn(2) },
          { plan: 'starter', startsAt: isoIn(2), endsAt: isoIn(4) }
        ],
        fixedTerms: [{ source: CloudFixedTermSource.Redemption, plan: 'max', endsAt: isoIn(4), daysRemaining: 4 }],
        pendingSubscription: null
      }
    case 'redemption-stacked-long':
      // 当前 max 60 天，之后 pro 90 天、starter 30 天，总计 180 天。
      return {
        plan: { paid: 'max', capability: 'max', billingPeriod: null, source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 180,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(180),
          flags: ACTIVE_FLAGS
        },
        subscription: null,
        redemptionQueue: [
          { plan: 'pro', startsAt: isoIn(60), endsAt: isoIn(150) },
          { plan: 'starter', startsAt: isoIn(150), endsAt: isoIn(180) }
        ],
        fixedTerms: [{ source: CloudFixedTermSource.Redemption, plan: 'max', endsAt: isoIn(180), daysRemaining: 180 }],
        pendingSubscription: null
      }
    case 'subscription-with-redemption':
      // 年付 pro 订阅续费中（250 天后续费），同时兑换的 max 还剩 40 天，二者并行计时。
      return {
        plan: { paid: 'max', capability: 'max', billingPeriod: 'yearly', subscription: 'pro', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 250,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(250),
          flags: ACTIVE_FLAGS
        },
        subscription: { status: 'active', standing: CloudSubscriptionStanding.Live, currentPeriodEnd: isoIn(250) },
        redemptionQueue: [],
        fixedTerms: [{ source: CloudFixedTermSource.Redemption, plan: 'max', endsAt: isoIn(40), daysRemaining: 40 }],
        pendingSubscription: null
      }
    case 'subscription-ended-with-redemption':
      // 年付订阅已结束（billingPeriod 仍来自订阅产品），只剩兑换的 pro 30 天。
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'yearly', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 30,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(30),
          flags: ACTIVE_FLAGS
        },
        subscription: { status: 'canceled', standing: CloudSubscriptionStanding.Ended, currentPeriodEnd: isoIn(-10) },
        redemptionQueue: [],
        fixedTerms: [{ source: CloudFixedTermSource.Redemption, plan: 'pro', endsAt: isoIn(30), daysRemaining: 30 }],
        pendingSubscription: null
      }
    case 'subscription-pending':
      // 已付款、订阅权益已生效，但 webhook 尚未写入订阅记录。
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', subscription: 'pro', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 30,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(30),
          flags: ACTIVE_FLAGS
        },
        subscription: null,
        redemptionQueue: [],
        fixedTerms: [],
        pendingSubscription: { plan: 'pro' }
      }
  }
}

type MockQuota = { storage: number, media: number, configHistory: number }

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

/** 仅供 mock 展示的配额，非线上真实数值。 */
const MOCK_QUOTAS: Record<string, MockQuota> = {
  free: { storage: 500 * MB, media: 200, configHistory: 3 },
  starter: { storage: 10 * GB, media: 10000, configHistory: 20 },
  pro: { storage: 50 * GB, media: 50000, configHistory: 50 },
  max: { storage: 200 * GB, media: 200000, configHistory: 100 }
}

const getMockQuota = (plan: string): MockQuota => MOCK_QUOTAS[plan] ?? MOCK_QUOTAS.free

const isDowngradedScenario = (scenario: MockLifecycleScenario): boolean =>
  scenario === 'grace' || scenario === 'frozen' || scenario === 'pending-cleanup'

export function buildMockUsage (
  scenario: MockLifecycleScenario,
  appType: 'gui' | 'cli'
): CloudUsage {
  const isoIn = createIsoIn(Date.now())
  const overview = buildMockOverview(scenario)
  const isDowngraded = isDowngradedScenario(scenario)
  const effectiveQuotaPlan = isDowngraded ? 'free' : overview.plan.capability
  const quota = getMockQuota(effectiveQuotaPlan)
  return {
    plan: overview.plan.paid,
    effectiveQuotaPlan,
    storage: {
      // 降级场景故意超出 free 配额，便于观察超限提示。
      used: isDowngraded ? Math.round(quota.storage * 1.4) : Math.round(quota.storage * 0.32),
      limit: quota.storage
    },
    mediaCount: {
      used: isDowngraded ? 5000 : Math.round(quota.media * 0.16),
      limit: quota.media
    },
    monthlyServes: {
      used: 12345,
      periodStart: isoIn(-15),
      periodEnd: isoIn(15)
    },
    configHistory: { used: 5, limit: quota.configHistory, appType }
  }
}

/** PicGo desktop UserPlanLevel: Free=0 / Starter=1 / Pro=2 / Max=3 */
const PLAN_LEVEL: Record<string, number> = { free: 0, starter: 1, pro: 2, max: 3 }

export function buildMockWhoami (scenario: MockLifecycleScenario): ICloudUserInfo {
  // displayPlan = max(paidPlan, capabilityPlan) by rank。
  // autoImport 默认仅在 active 阶段开启（永久赠送除外），方便观察 grace/frozen 的禁用提示。
  const { plan, lifecycle } = buildMockOverview(scenario)
  const level = Math.max(PLAN_LEVEL[plan.paid] ?? 0, PLAN_LEVEL[plan.capability] ?? 0)
  return {
    user: 'Mock User',
    avatar: null,
    plan: level,
    autoImport: lifecycle.phase === 'active' && plan.source !== 'admin_grant'
  }
}
