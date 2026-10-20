import { CreateCustomerParams, CreateSubscriptionParams, CustomerResult, IBillingProvider, SubscriptionResult } from './types';

export class MockBillingProvider implements IBillingProvider {
  async createCustomer(params: CreateCustomerParams): Promise<CustomerResult> {
    return {
      customerId: `cus_mock_${params.organizationId.substring(0, 8)}`,
    };
  }

  async createSubscription(_params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    const nowSecs = Math.floor(Date.now() / 1000);
    return {
      subscriptionId: `sub_mock_${Math.random().toString(36).substring(7)}`,
      status: 'active',
      currentPeriodStart: nowSecs,
      currentPeriodEnd: nowSecs + 30 * 86400,
    };
  }

  constructWebhookEvent(payload: string | Buffer, _signature: string, _secret: string): unknown {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return { type: 'mock.event' };
      }
    }
    return { type: 'mock.event' };
  }
}
