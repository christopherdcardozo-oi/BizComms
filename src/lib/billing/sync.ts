import type { BillingEvent, IBillingProvider, SubscriptionSnapshot } from '../providers/billing/types';

export interface BillingStore {
  // Only writes when the org exists; returns false otherwise.
  applySubscription(
    organizationId: string,
    state: { customerId: string; subscriptionId: string; priceId: string | null; status: string }
  ): Promise<boolean>;
  findOrganizationByCustomer(customerId: string): Promise<string | null>;
  beginEvent(eventId: string): Promise<'new' | 'duplicate'>;
  completeEvent(eventId: string): Promise<void>;
}

export interface BillingDeps {
  provider: IBillingProvider;
  store: BillingStore;
  logger: { warn(m: string, c?: Record<string, unknown>): void; error(m: string, c?: Record<string, unknown>): void };
}

export type SyncResult = 'synced' | 'unmatched' | 'not_complete' | 'wrong_organization';

// Order-independent: always re-reads the subscription from Stripe and writes its *current*
// state, so a late or replayed event can never roll an organization back to an old status.
export async function syncSubscription(subscriptionId: string, deps: BillingDeps): Promise<SyncResult> {
  const sub: SubscriptionSnapshot = await deps.provider.getSubscription(subscriptionId);
  const organizationId = sub.organizationId ?? (await deps.store.findOrganizationByCustomer(sub.customerId));
  if (!organizationId) {
    deps.logger.warn('Stripe subscription has no matching organization', { subscriptionId });
    return 'unmatched';
  }
  const applied = await deps.store.applySubscription(organizationId, {
    customerId: sub.customerId,
    subscriptionId: sub.subscriptionId,
    priceId: sub.priceId,
    status: sub.status,
  });
  return applied ? 'synced' : 'unmatched';
}

// Called when the customer lands back from Checkout. Confirms with Stripe directly (never
// trusts the redirect), and only for the signed-in organization's own session, so one tenant
// can't replay another tenant's session_id to borrow their subscription.
export async function syncCheckoutSession(
  sessionId: string,
  expectedOrganizationId: string,
  deps: BillingDeps
): Promise<SyncResult> {
  const session = await deps.provider.getCheckoutSession(sessionId);
  if (session.organizationId !== expectedOrganizationId) {
    deps.logger.warn('Checkout session belongs to a different organization', { sessionId, expectedOrganizationId });
    return 'wrong_organization';
  }
  if (session.status !== 'complete' || !session.subscriptionId) return 'not_complete';
  return syncSubscription(session.subscriptionId, deps);
}

export type WebhookOutcome = { status: 200 | 400 | 500; body: string };

// POST /api/stripe/webhook. Stripe retries any non-2xx for up to three days, so transient
// failures return 500 and are retried; no extra replay buffer is needed.
export async function handleBillingWebhook(
  payload: string,
  signature: string | null,
  secret: string | undefined,
  deps: BillingDeps
): Promise<WebhookOutcome> {
  if (!signature || !secret) return { status: 400, body: 'missing signature' };

  let event: BillingEvent;
  try {
    event = deps.provider.constructWebhookEvent(payload, signature, secret);
  } catch {
    return { status: 400, body: 'invalid signature' };
  }

  try {
    if ((await deps.store.beginEvent(event.id)) === 'duplicate') return { status: 200, body: 'duplicate' };

    if (event.kind === 'subscription_changed') {
      await syncSubscription(event.subscriptionId, deps);
    } else if (event.kind === 'checkout_completed') {
      const session = await deps.provider.getCheckoutSession(event.sessionId);
      if (session.subscriptionId) await syncSubscription(session.subscriptionId, deps);
    }

    await deps.store.completeEvent(event.id);
    return { status: 200, body: 'ok' };
  } catch (err) {
    deps.logger.error('Stripe webhook processing failed', { eventId: event.id, error: String(err) });
    return { status: 500, body: 'retry' };
  }
}
