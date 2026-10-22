// Which plan a subscription is on, and what that plan unlocks. The plan is derived from the
// Stripe price on the subscription (organizations.stripe_price_id, kept current by the webhook),
// so changing plans in the Stripe portal changes features with no extra bookkeeping.
import { serverEnv } from '../config/env';
import { TEXT_BACK_FORWARDED_MINUTES, type PricingPlan } from '../site';

export type PlanId = PricingPlan['id'];

export const PLAN_IDS: readonly PlanId[] = ['text-back', 'receptionist', 'complete'];

export interface PlanFeatures {
  aiReceptionist: boolean;
  reviews: boolean;
}

const FEATURES: Record<PlanId, PlanFeatures> = {
  'text-back': { aiReceptionist: false, reviews: false },
  receptionist: { aiReceptionist: true, reviews: false },
  complete: { aiReceptionist: true, reviews: true },
};

export const PLAN_NAMES: Record<PlanId, string> = {
  'text-back': 'Text-Back',
  receptionist: 'Receptionist',
  complete: 'Complete',
};

export type PlanPrices = Partial<Record<PlanId, string>>;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

function hasPlanPrices(prices: PlanPrices): boolean {
  return PLAN_IDS.some((id) => !!prices[id]);
}

// Single-price mode (no per-plan prices configured): every subscriber gets every feature, as
// before plans existed. Per-plan mode: an unrecognized price gets the smallest plan, so a
// misconfigured price never hands out features nobody paid for. Texting and call forwarding
// are in every plan, so no customer loses calls over a price mix-up.
export function planForPrice(priceId: string | null | undefined, prices: PlanPrices = serverEnv.stripePlanPrices()): PlanId {
  if (!hasPlanPrices(prices)) return 'complete';
  const match = PLAN_IDS.find((id) => prices[id] && prices[id] === priceId);
  if (match) return match;
  // The original single price (STRIPE_PRICE_STARTER) included everything; keep it that way.
  if (priceId && priceId === serverEnv.stripePriceId()) return 'complete';
  return 'text-back';
}

export function planFeatures(priceId: string | null | undefined, prices?: PlanPrices): PlanFeatures {
  return FEATURES[planForPrice(priceId, prices)];
}

export function featuresOf(plan: PlanId): PlanFeatures {
  return FEATURES[plan];
}

// The Stripe price to sell for a plan. In single-price mode every plan checks out on that price.
export function checkoutPriceFor(plan: PlanId, prices: PlanPrices = serverEnv.stripePlanPrices()): string | undefined {
  return hasPlanPrices(prices) ? prices[plan] : serverEnv.stripePriceId();
}

// Fair-use allowance for minutes forwarded to the owner's phone, by plan (none = no allowance).
// Soft limit only: shown in Settings, never enforced by blocking or dropping calls.
export const FORWARDED_MINUTES_FAIR_USE: Partial<Record<PlanId, number>> = { 'text-back': TEXT_BACK_FORWARDED_MINUTES };

export function fairUseStatus(usedMinutes: number, limit: number): 'ok' | 'near' | 'over' {
  if (usedMinutes > limit) return 'over';
  return usedMinutes >= limit * 0.8 ? 'near' : 'ok';
}
