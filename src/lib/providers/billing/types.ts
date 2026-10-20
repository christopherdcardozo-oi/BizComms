export interface CreateCustomerParams {
  organizationId: string;
  name: string;
  email: string;
}

export interface CustomerResult {
  customerId: string;
}

export interface CheckoutParams {
  organizationId: string;
  customerId?: string; // reuse when re-subscribing after a cancellation
  customerEmail?: string;
  priceId: string;
  successUrl: string; // must contain {CHECKOUT_SESSION_ID}
  cancelUrl: string;
  trialDays?: number;
}

// Provider-neutral snapshots: the app never depends on Stripe's object shapes directly.
export interface SubscriptionSnapshot {
  subscriptionId: string;
  customerId: string;
  status: string; // Stripe statuses: active, trialing, past_due, canceled, unpaid, incomplete, ...
  priceId: string | null;
  organizationId: string | null; // from subscription metadata
}

export interface CheckoutSnapshot {
  sessionId: string;
  organizationId: string | null; // client_reference_id
  status: 'open' | 'complete' | 'expired';
  subscriptionId: string | null;
}

export type BillingEvent =
  | { id: string; kind: 'checkout_completed'; sessionId: string }
  | { id: string; kind: 'subscription_changed'; subscriptionId: string }
  | { id: string; kind: 'ignored'; type: string };

export interface IBillingProvider {
  createCustomer(params: CreateCustomerParams): Promise<CustomerResult>;
  createCheckoutSession(params: CheckoutParams): Promise<{ sessionId: string; url: string }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  getCheckoutSession(sessionId: string): Promise<CheckoutSnapshot>;
  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
  // Verifies the signature and normalizes the event; throws when verification fails.
  constructWebhookEvent(payload: string, signature: string, secret: string): BillingEvent;
}
