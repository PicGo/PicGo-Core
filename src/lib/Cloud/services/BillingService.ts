import type { CloudBillingOverview, CloudUsage, IPicGo } from '../../../types'
import { APPType } from '../../ConfigSyncManager/types'
import { AuthRequestClient } from '../Request'

interface BillingUsageResponse extends CloudUsage {
  monthlyBandwidth?: unknown
}

interface BillingOverviewResponse extends CloudBillingOverview {
  success: boolean
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
    const response = await this.client.request<BillingUsageResponse>({
      method: 'GET',
      url: '/api/billing/usage',
      params: {
        appType
      }
    }, token)

    return {
      plan: response.plan,
      storage: response.storage,
      mediaCount: response.mediaCount,
      monthlyServes: response.monthlyServes,
      configHistory: response.configHistory
    }
  }

  async getOverview (token?: string): Promise<CloudBillingOverview> {
    const response = await this.client.request<BillingOverviewResponse>({
      method: 'GET',
      url: '/api/billing/me'
    }, token)

    return {
      plan: response.plan,
      lifecycle: response.lifecycle,
      subscription: response.subscription
    }
  }
}

export { BillingService }
