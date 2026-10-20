// Single source of truth for what a subscription status allows. Statuses come from Stripe,
// plus 'none' (never subscribed) set by the database default.

// May buy a phone number: paying or in a card-backed trial.
const PROVISION_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

// Paid features keep working. past_due is Stripe's dunning window (retrying the card), so
// customers aren't cut off over a card that is about to be fixed.
const SERVICE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

export function canProvisionNumber(status: string | null | undefined): boolean {
  return !!status && PROVISION_STATUSES.has(status);
}

// Gates outbound texting and the AI receptionist. Call forwarding is deliberately NOT gated:
// a lapsed payment must never silently drop a business's inbound calls.
export function billingAllowsService(status: string | null | undefined): boolean {
  return !!status && SERVICE_STATUSES.has(status);
}

export function describeSubscription(status: string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Free trial';
    case 'past_due':
      return 'Payment failed — retrying';
    case 'canceled':
      return 'Canceled';
    case 'unpaid':
      return 'Unpaid';
    case 'paused':
      return 'Paused';
    case 'incomplete':
    case 'incomplete_expired':
      return 'Payment incomplete';
    default:
      return 'Not subscribed';
  }
}
