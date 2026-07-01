import type { CloudBillingOverview, CloudUsage, IPicGo } from '../../../types'
import { APPType } from '../../ConfigSyncManager/types'
import { AuthRequestClient } from '../Request'
import { buildMockOverview, buildMockUsage, getMockScenario } from '../__mocks__/lifecycleScenarios'

interface BillingUsagePayload extends CloudUsage {
  monthlyBandwidth?: unknown
}

interface BillingUsageEnvelope {
  success: boolean
  data: BillingUsagePayload
}

interface BillingOverviewEnvelope {
  success: boolean
  data: CloudBillingOverview
}

class BillingService {
  private readonly client: AuthRequestClient
  private readonly ctx: IPicGo

  constructor (ctx: IPicGo) {
    this.client = new AuthRequestClient(ctx)
    this.ctx = ctx
  }

  async getUsage (token?: string): Promise<CloudUsage> {
    const appType = this.ctx.GUI_VERSION ? APPType.GUI : APPType.CLI
    const mockScenario = getMockScenario()
    if (mockScenario) {
      this.ctx.log.warn(`[MOCK] BillingService.getUsage scenario=${mockScenario}`)
      return buildMockUsage(mockScenario, appType === APPType.GUI ? 'gui' : 'cli')
    }
    const response = await this.client.request<BillingUsageEnvelope>({
      method: 'GET',
      url: '/api/billing/usage',
      params: {
        appType
      }
    }, token)

    const payload = response.data
    return {
      plan: payload.plan,
      effectiveQuotaPlan: payload.effectiveQuotaPlan,
      storage: payload.storage,
      mediaCount: payload.mediaCount,
      monthlyServes: payload.monthlyServes,
      configHistory: payload.configHistory
    }
  }

  async getOverview (token?: string): Promise<CloudBillingOverview> {
    const mockScenario = getMockScenario()
    if (mockScenario) {
      this.ctx.log.warn(`[MOCK] BillingService.getOverview scenario=${mockScenario}`)
      return buildMockOverview(mockScenario)
    }
    const response = await this.client.request<BillingOverviewEnvelope>({
      method: 'GET',
      url: '/api/billing/me'
    }, token)

    const payload = response.data
    return {
      plan: payload.plan,
      lifecycle: payload.lifecycle,
      subscription: payload.subscription
    }
  }
}

export { BillingService }
