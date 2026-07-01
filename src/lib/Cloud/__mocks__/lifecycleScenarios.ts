import type { CloudBillingOverview, CloudUsage, ICloudUserInfo } from '../../../types'

/**
 * 本文件用于本地开发 / QA 验收 lifecycle v2 UI 表现，不参与线上逻辑。
 * 通过环境变量 `PICGO_MOCK_LIFECYCLE=<scenario>` 启用。
 *
 * 使用方式（PicGo desktop 主进程会读到 process.env）：
 *   PICGO_MOCK_LIFECYCLE=grace pnpm dev
 *
 * 可选值：active-pro | active-pro-yearly | active-grant | grace | frozen | pending-cleanup
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

const ALL_SCENARIOS: MockLifecycleScenario[] = [
  'active-pro',
  'active-pro-yearly',
  'active-pro-cancel',
  'active-grant',
  'active-grant-lifetime',
  'grace',
  'frozen',
  'pending-cleanup'
]

export function getMockScenario (): MockLifecycleScenario | undefined {
  const value = process.env.PICGO_MOCK_LIFECYCLE
  if (!value) return undefined
  return ALL_SCENARIOS.includes(value as MockLifecycleScenario)
    ? (value as MockLifecycleScenario)
    : undefined
}

const DAY_MS = 24 * 60 * 60 * 1000
const isoIn = (days: number): string =>
  new Date(Date.now() + days * DAY_MS).toISOString()

export function buildMockOverview (scenario: MockLifecycleScenario): CloudBillingOverview {
  switch (scenario) {
    case 'active-pro':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 20,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(20),
          flags: { customDomainDisabledByLifecycle: false, autoImportDisabledByLifecycle: false }
        },
        subscription: { status: 'active', currentPeriodEnd: isoIn(20) }
      }
    case 'active-pro-yearly':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'yearly', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 180,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(180),
          flags: { customDomainDisabledByLifecycle: false, autoImportDisabledByLifecycle: false }
        },
        subscription: { status: 'active', currentPeriodEnd: isoIn(180) }
      }
    case 'active-pro-cancel':
      return {
        plan: { paid: 'pro', capability: 'pro', billingPeriod: 'monthly', source: 'entitlement' },
        lifecycle: {
          phase: 'active',
          daysRemaining: 20,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: isoIn(20),
          flags: { customDomainDisabledByLifecycle: false, autoImportDisabledByLifecycle: false }
        },
        subscription: { status: 'scheduled_cancel', currentPeriodEnd: isoIn(20) }
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
          flags: { customDomainDisabledByLifecycle: false, autoImportDisabledByLifecycle: false }
        },
        subscription: null
      }
    case 'active-grant-lifetime':
      return {
        plan: { paid: 'free', capability: 'pro', billingPeriod: null, source: 'admin_grant' },
        lifecycle: {
          phase: 'active',
          daysRemaining: null,
          graceEndsAt: null,
          freezeEndsAt: null,
          currentPhaseEndsAt: null,
          flags: { customDomainDisabledByLifecycle: false, autoImportDisabledByLifecycle: false }
        },
        subscription: null
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
          flags: { customDomainDisabledByLifecycle: true, autoImportDisabledByLifecycle: true }
        },
        subscription: { status: 'past_due', currentPeriodEnd: isoIn(-3) }
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
          flags: { customDomainDisabledByLifecycle: true, autoImportDisabledByLifecycle: true }
        },
        subscription: { status: 'canceled', currentPeriodEnd: isoIn(-30) }
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
          flags: { customDomainDisabledByLifecycle: true, autoImportDisabledByLifecycle: true }
        },
        subscription: null
      }
  }
}

export function buildMockUsage (
  scenario: MockLifecycleScenario,
  appType: 'gui' | 'cli'
): CloudUsage {
  const isDowngraded =
    scenario === 'grace' || scenario === 'frozen' || scenario === 'pending-cleanup'
  const PRO_STORAGE = 50 * 1024 * 1024 * 1024
  const FREE_STORAGE = 500 * 1024 * 1024
  const PRO_MEDIA = 50000
  const FREE_MEDIA = 200
  return {
    plan: 'pro',
    effectiveQuotaPlan: isDowngraded ? 'free' : 'pro',
    storage: {
      used: isDowngraded ? Math.round(FREE_STORAGE * 1.4) : Math.round(PRO_STORAGE * 0.32),
      limit: isDowngraded ? FREE_STORAGE : PRO_STORAGE
    },
    mediaCount: {
      used: isDowngraded ? 5000 : 8120,
      limit: isDowngraded ? FREE_MEDIA : PRO_MEDIA
    },
    monthlyServes: {
      used: 12345,
      periodStart: isoIn(-15),
      periodEnd: isoIn(15)
    },
    configHistory: { used: 5, limit: isDowngraded ? 3 : 50, appType }
  }
}

export function buildMockWhoami (scenario: MockLifecycleScenario): ICloudUserInfo {
  // displayPlan = max(paidPlan, capabilityPlan) by rank
  // PicGo desktop UserPlanLevel: Free=0 / Starter=1 / Pro=2 / Max=3
  // 所有 mock 场景都至少 capability=pro，所以 displayPlan 始终为 2（Pro）。
  // autoImport 默认仅在 active 套餐里开启，方便观察 grace/frozen 的禁用提示。
  return {
    user: 'Mock User',
    avatar: null,
    plan: 2,
    autoImport: scenario === 'active-pro' || scenario === 'active-pro-yearly' || scenario === 'active-pro-cancel'
  }
}
