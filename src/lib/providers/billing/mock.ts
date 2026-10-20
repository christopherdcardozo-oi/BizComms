import type {
  BillingEvent,
  CheckoutParams,
  CheckoutSnapshot,
  CreateCustomerParams,
  CustomerResult,
  IBillingProvider,
  SubscriptionSnapshot,
} from './types';

export const MOCK_WEBHOOK_SIGNATURE = 'mock-signature';

// Local-dev billing: checkout "completes" instantly by redirecting straight to success_url,
// and the session/subscription lookups report an active subscription for that org.
export class MockBillingProvider implements IBillingProvider {
  subscriptions = new Map<string, SubscriptionSnapshot>();
  sessions = new Map<string, CheckoutSnapshot>();

  async createCustomer(params: CreateCustomerParams): Promise<CustomerResult> {
    return { customerId: `cus_mock_${params.organizationId.substring(0, 8)}` };
  }

  async createCheckoutSession(params: CheckoutParams): Promise<{ sessionId: string; url: string }> {
    const sessionId = `cs_mock_${params.organizationId}`;
    const subscriptionId = `sub_mock_${params.organizationId}`;
    this.sessions.set(sessionId, { sessionId, organizationId: params.organizationId, status: 'complete', subscriptionId });
    this.subscriptions.set(subscriptionId, {
      subscriptionId,
      customerId: params.customerId ?? `cus_mock_${params.organizationId.substring(0, 8)}`,
      status: params.trialDays ? 'trialing' : 'active',
      priceId: params.priceId,
      organizationId: params.organizationId,
    });
    return { sessionId, url: params.successUrl.replace('{CHECKOUT_SESSION_ID}', sessionId) };
  }

  async createPortalSession(_customerId: string, returnUrl: string): Promise<{ url: string }> {
    return { url: returnUrl };
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSnapshot> {
    // Stateless fallback so a mock session survives a dev-server restart.
    const orgId = sessionId.startsWith('cs_mock_') ? sessionId.slice('cs_mock_'.length) : null;
    return (
      this.sessions.get(sessionId) ?? {
        sessionId,
        organizationId: orgId,
        status: orgId ? 'complete' : 'expired',
        subscriptionId: orgId ? `sub_mock_${orgId}` : null,
      }
    );
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const orgId = subscriptionId.startsWith('sub_mock_') ? subscriptionId.slice('sub_mock_'.length) : null;
    return (
      this.subscriptions.get(subscriptionId) ?? {
        subscriptionId,
        customerId: `cus_mock_${(orgId ?? 'unknown').substring(0, 8)}`,
        status: 'active',
        priceId: 'price_mock',
        organizationId: orgId,
      }
    );
  }

  constructWebhookEvent(payload: string, signature: string, _secret: string): BillingEvent {
    if (signature !== MOCK_WEBHOOK_SIGNATURE) throw new Error('Invalid mock signature');
    return JSON.parse(payload) as BillingEvent;
  }
}
