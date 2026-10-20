export interface CreateCustomerParams {
  organizationId: string;
  name: string;
  email: string;
}

export interface CustomerResult {
  customerId: string;
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
}

export interface SubscriptionResult {
  subscriptionId: string;
  status: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
}

export interface IBillingProvider {
  createCustomer(params: CreateCustomerParams): Promise<CustomerResult>;
  createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult>;
  constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): unknown;
}
