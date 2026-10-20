// Billing tests: status rules, Stripe subscription sync, checkout return, webhook handling
// (with real Stripe signatures) and billing gates on paid features.
// Run with: npx sucrase-node tests/billing.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Stripe from 'stripe';
import { billingAllowsService, canProvisionNumber } from '../src/lib/billing/status';
import { handleBillingWebhook, syncCheckoutSession, syncSubscription, type BillingStore } from '../src/lib/billing/sync';
import { MOCK_WEBHOOK_SIGNATURE, MockBillingProvider } from '../src/lib/providers/billing/mock';
import { StripeBillingProvider } from '../src/lib/providers/billing/stripe';
import { sendManualReply } from '../src/lib/sms/outbound';
import { handleDialAction, handleIncomingCall } from '../src/lib/telephony/handlers';
import { CALL, LINE, TUESDAY_8PM_CHICAGO, makeDeps, runAll } from './support/telephony-fakes';

class FakeBillingStore implements BillingStore {
  orgs = new Map<string, { customerId?: string; subscriptionId?: string; priceId?: string | null; status: string }>([
    ['org-1', { status: 'none' }],
    ['org-2', { status: 'none' }],
  ]);
  events = new Map<string, boolean>();
  failWrites = false;
  writes = 0;

  async applySubscription(orgId: string, state: { customerId: string; subscriptionId: string; priceId: string | null; status: string }) {
    if (this.failWrites) throw new Error('db down');
    if (!this.orgs.has(orgId)) return false;
    this.writes++;
    this.orgs.set(orgId, state);
    return true;
  }
  async findOrganizationByCustomer(customerId: string) {
    return [...this.orgs.entries()].find(([, o]) => o.customerId === customerId)?.[0] ?? null;
  }
  async beginEvent(id: string) {
    if (this.events.get(id)) return 'duplicate' as const;
    this.events.set(id, false);
    return 'new' as const;
  }
  async completeEvent(id: string) {
    this.events.set(id, true);
  }
}

function billing() {
  const provider = new MockBillingProvider();
  const store = new FakeBillingStore();
  const warnings: string[] = [];
  const deps = { provider, store, logger: { warn: (m: string) => void warnings.push(m), error: (m: string) => void warnings.push(m) } };
  return { provider, store, deps, warnings };
}

// ---------------------------------------------------------------------------
// Status rules
// ---------------------------------------------------------------------------
test('status: only active/trialing may buy numbers; past_due keeps service during dunning', () => {
  assert.deepEqual(['active', 'trialing', 'past_due', 'canceled', 'none', null].map(canProvisionNumber), [true, true, false, false, false, false]);
  assert.deepEqual(['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'none', null].map(billingAllowsService), [true, true, true, false, false, false, false]);
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
test('syncSubscription writes the current Stripe state to the org named in metadata', async () => {
  const { provider, store, deps } = billing();
  provider.subscriptions.set('sub_1', { subscriptionId: 'sub_1', customerId: 'cus_1', status: 'trialing', priceId: 'price_1', organizationId: 'org-1' });
  assert.equal(await syncSubscription('sub_1', deps), 'synced');
  assert.deepEqual(store.orgs.get('org-1'), { customerId: 'cus_1', subscriptionId: 'sub_1', priceId: 'price_1', status: 'trialing' });
});

test('syncSubscription falls back to the Stripe customer when metadata is missing', async () => {
  const { provider, store, deps } = billing();
  store.orgs.set('org-2', { customerId: 'cus_2', status: 'active' });
  provider.subscriptions.set('sub_2', { subscriptionId: 'sub_2', customerId: 'cus_2', status: 'past_due', priceId: null, organizationId: null });
  assert.equal(await syncSubscription('sub_2', deps), 'synced');
  assert.equal(store.orgs.get('org-2')?.status, 'past_due');
  provider.subscriptions.set('sub_3', { subscriptionId: 'sub_3', customerId: 'cus_unknown', status: 'active', priceId: null, organizationId: null });
  assert.equal(await syncSubscription('sub_3', deps), 'unmatched');
});

test("checkout return: refuses another organization's session_id", async () => {
  const { provider, store, deps } = billing();
  const { sessionId } = await provider.createCheckoutSession({
    organizationId: 'org-2',
    priceId: 'price_1',
    successUrl: 'https://app.test/return?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://app.test/cancel',
  });
  assert.equal(await syncCheckoutSession(sessionId, 'org-1', deps), 'wrong_organization');
  assert.equal(store.writes, 0);
  assert.equal(await syncCheckoutSession(sessionId, 'org-2', deps), 'synced');
  assert.equal(store.orgs.get('org-2')?.status, 'active');
});

test('checkout return: an unpaid (open) session grants nothing', async () => {
  const { provider, store, deps } = billing();
  provider.sessions.set('cs_open', { sessionId: 'cs_open', organizationId: 'org-1', status: 'open', subscriptionId: null });
  assert.equal(await syncCheckoutSession('cs_open', 'org-1', deps), 'not_complete');
  assert.equal(store.orgs.get('org-1')?.status, 'none');
});

// ---------------------------------------------------------------------------
// Webhook handling
// ---------------------------------------------------------------------------
const mockEvent = (event: object) => JSON.stringify(event);

test('webhook: missing or invalid signature is rejected with 400', async () => {
  const { deps } = billing();
  assert.equal((await handleBillingWebhook('{}', null, 'whsec', deps)).status, 400);
  assert.equal((await handleBillingWebhook('{}', 'forged', 'whsec', deps)).status, 400);
  assert.equal((await handleBillingWebhook('{}', MOCK_WEBHOOK_SIGNATURE, undefined, deps)).status, 400);
});

test('webhook: re-fetches state, so a stale "active" event cannot undo a cancellation', async () => {
  const { provider, store, deps } = billing();
  provider.subscriptions.set('sub_1', { subscriptionId: 'sub_1', customerId: 'cus_1', status: 'canceled', priceId: 'price_1', organizationId: 'org-1' });
  // This event was emitted back when the subscription was created/active, but arrives late.
  const late = mockEvent({ id: 'evt_old', kind: 'subscription_changed', subscriptionId: 'sub_1' });
  assert.equal((await handleBillingWebhook(late, MOCK_WEBHOOK_SIGNATURE, 'whsec', deps)).status, 200);
  assert.equal(store.orgs.get('org-1')?.status, 'canceled');
});

test('webhook: duplicate deliveries are processed once; failures return 500 for Stripe to retry', async () => {
  const { provider, store, deps } = billing();
  provider.subscriptions.set('sub_1', { subscriptionId: 'sub_1', customerId: 'cus_1', status: 'active', priceId: 'price_1', organizationId: 'org-1' });
  const event = mockEvent({ id: 'evt_1', kind: 'subscription_changed', subscriptionId: 'sub_1' });

  store.failWrites = true;
  assert.equal((await handleBillingWebhook(event, MOCK_WEBHOOK_SIGNATURE, 'whsec', deps)).status, 500);
  store.failWrites = false;
  assert.equal((await handleBillingWebhook(event, MOCK_WEBHOOK_SIGNATURE, 'whsec', deps)).status, 200, 'retry succeeds');
  assert.equal((await handleBillingWebhook(event, MOCK_WEBHOOK_SIGNATURE, 'whsec', deps)).body, 'duplicate');
  assert.equal(store.writes, 1);
});

test('Stripe provider: verifies real signatures and normalizes events; rejects tampering', () => {
  const secret = 'whsec_test_secret';
  const provider = new StripeBillingProvider('sk_test_dummy');
  const stripe = new Stripe('sk_test_dummy');
  const sign = (payload: string) => stripe.webhooks.generateTestHeaderString({ payload, secret });

  const checkout = JSON.stringify({
    id: 'evt_c',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', object: 'checkout.session', mode: 'subscription' } },
  });
  assert.deepEqual(provider.constructWebhookEvent(checkout, sign(checkout), secret), {
    id: 'evt_c',
    kind: 'checkout_completed',
    sessionId: 'cs_test_1',
  });

  const deleted = JSON.stringify({
    id: 'evt_d',
    object: 'event',
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_test_1', object: 'subscription' } },
  });
  assert.deepEqual(provider.constructWebhookEvent(deleted, sign(deleted), secret), {
    id: 'evt_d',
    kind: 'subscription_changed',
    subscriptionId: 'sub_test_1',
  });

  const invoice = JSON.stringify({ id: 'evt_i', object: 'event', type: 'invoice.paid', data: { object: { id: 'in_1' } } });
  assert.equal(provider.constructWebhookEvent(invoice, sign(invoice), secret).kind, 'ignored');

  assert.throws(() => provider.constructWebhookEvent(deleted.replace('sub_test_1', 'sub_evil'), sign(deleted), secret));
  assert.throws(() => provider.constructWebhookEvent(deleted, sign(deleted), 'whsec_wrong'));
});

// ---------------------------------------------------------------------------
// Billing gates on paid features
// ---------------------------------------------------------------------------
test('gates: lapsed subscription stops text-backs but never stops call forwarding', async () => {
  const { deps, repo, sms } = makeDeps({ now: () => TUESDAY_8PM_CHICAGO });
  repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, subscriptionStatus: 'canceled' });

  const incoming = await handleIncomingCall(CALL, deps);
  assert.match(incoming.twiml!, /<Number>\+12025550199<\/Number>/, 'still rings the owner (no AI after hours)');

  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', deps));
  assert.equal(sms.sentMessages.length, 0, 'no text-back while canceled');
});

test('gates: past_due keeps text-backs working during card retries', async () => {
  const { deps, repo, sms } = makeDeps();
  repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, subscriptionStatus: 'past_due' });
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', deps));
  assert.equal(sms.sentMessages.length, 1);
});

test('gates: inbox replies require an active subscription', async () => {
  const { deps } = makeDeps();
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'completed' }, 'forward', deps));
  const result = await sendManualReply(
    { organizationId: LINE.organizationId, fromNumber: LINE.twilioPhoneNumber, to: CALL.From, body: 'Hi', subscriptionStatus: 'unpaid' },
    deps
  );
  assert.deepEqual(result, { ok: false, error: 'billing_inactive' });
});
