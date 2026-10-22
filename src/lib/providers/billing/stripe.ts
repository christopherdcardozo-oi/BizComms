import Stripe from 'stripe';
import type {
  BillingEvent,
  CheckoutParams,
  CheckoutSnapshot,
  CreateCustomerParams,
  CustomerResult,
  IBillingProvider,
  SubscriptionSnapshot,
} from './types';

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export class StripeBillingProvider implements IBillingProvider {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createCustomer(params: CreateCustomerParams): Promise<CustomerResult> {
    const customer = await this.stripe.customers.create({
      name: params.name,
      email: params.email,
      metadata: { organization_id: params.organizationId },
    });
    return { customerId: customer.id };
  }

  async createCheckoutSession(params: CheckoutParams): Promise<{ sessionId: string; url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      // Bank debit (ACH) costs about a third of card fees: 0.8% capped at $5 vs 2.9% + 30¢.
      // A filter on the account's enabled methods: ACH must also be on in the Stripe Dashboard
      // (scripts/stripe-setup.mjs turns it on).
      allowed_payment_method_types: ['card', 'link', 'us_bank_account'],
      payment_method_options: { us_bank_account: { verification_method: 'automatic' } },
      line_items: [
        { price: params.priceId, quantity: 1 },
        ...(params.setupFeePriceId ? [{ price: params.setupFeePriceId, quantity: 1 }] : []),
      ],
      client_reference_id: params.organizationId,
      ...(params.customerId ? { customer: params.customerId } : { customer_email: params.customerEmail }),
      subscription_data: {
        metadata: { organization_id: params.organizationId },
        ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      allow_promotion_codes: true,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { sessionId: session.id, url: session.url };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: session.url };
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSnapshot> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return {
      sessionId: session.id,
      organizationId: session.client_reference_id ?? null,
      status: (session.status ?? 'open') as CheckoutSnapshot['status'],
      subscriptionId: idOf(session.subscription),
    };
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    return {
      subscriptionId: sub.id,
      customerId: idOf(sub.customer) ?? '',
      status: sub.status,
      priceId: sub.items.data[0]?.price?.id ?? null,
      organizationId: sub.metadata?.organization_id ?? null,
    };
  }

  constructWebhookEvent(payload: string, signature: string, secret: string): BillingEvent {
    const event = this.stripe.webhooks.constructEvent(payload, signature, secret);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription') return { id: event.id, kind: 'checkout_completed', sessionId: session.id };
    }
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const sub = event.data.object as Stripe.Subscription;
      return { id: event.id, kind: 'subscription_changed', subscriptionId: sub.id };
    }
    return { id: event.id, kind: 'ignored', type: event.type };
  }
}
