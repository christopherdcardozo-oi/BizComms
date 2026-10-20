'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { canManage, requireOrganization, requireUser } from '@/lib/auth/session';
import { checkoutPriceFor, isPlanId } from '@/lib/billing/plans';
import { canProvisionNumber } from '@/lib/billing/status';
import { serverEnv } from '@/lib/config/env';
import { getBillingProvider } from '@/lib/providers/billing';
import { normalizeNanpNumber } from '@/lib/numbers/phone';
import { provisionNumber } from '@/lib/numbers/provision';
import { getProvisioningDeps } from '@/lib/numbers/server';
import type { AvailableNumber } from '@/lib/providers/numbers/types';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { US_TIMEZONES } from '@/lib/timezones';

export interface OrgFormState {
  error?: string;
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(100),
  timezone: z.enum(US_TIMEZONES),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `${base.length >= 2 ? base : 'biz'}-${randomBytes(2).toString('hex')}`;
}

export async function createOrganization(_prev: OrgFormState, formData: FormData): Promise<OrgFormState> {
  const session = await requireUser();
  if (session.organizationId) redirect('/onboarding');

  const parsed = orgSchema.safeParse({ name: formData.get('name'), timezone: formData.get('timezone') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Runs as the user: the RPC creates the org and promotes the caller to owner atomically.
  let orgId: string | null = null;
  for (let attempt = 0; attempt < 3 && !orgId; attempt++) {
    const { data, error } = await session.supabase.rpc('create_organization_for_user', {
      p_name: parsed.data.name,
      p_slug: slugify(parsed.data.name),
    });
    if (!error) orgId = data as string;
    else if (error.code !== '23505' || error.message.includes('already belongs')) return { error: error.message };
  }
  if (!orgId) return { error: 'Could not create your business. Please try again.' };

  await session.supabase.from('organizations').update({ timezone: parsed.data.timezone }).eq('id', orgId);
  redirect('/onboarding');
}

export interface NumberSearchState {
  error?: string;
  areaCode?: string;
  results?: AvailableNumber[];
}

export async function searchNumbers(_prev: NumberSearchState, formData: FormData): Promise<NumberSearchState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can add a phone number.' };
  if (!canProvisionNumber(session.subscriptionStatus)) return { error: 'Start your subscription first.' };

  const areaCode = String(formData.get('areaCode') ?? '').trim();
  if (!/^[2-9]\d{2}$/.test(areaCode)) return { error: 'Enter a 3-digit US area code, like 312.', areaCode };

  const limit = await rateLimiterFallback.limit(`number-search:${session.userId}`, 10, 60);
  if (!limit.success) return { error: 'Too many searches. Wait a minute and try again.', areaCode };

  try {
    const results = await getProvisioningDeps().provider.searchLocal(areaCode);
    if (results.length === 0) return { error: `No numbers available in ${areaCode}. Try a nearby area code.`, areaCode };
    return { areaCode, results };
  } catch {
    return { error: 'Number search is unavailable right now. Please try again.', areaCode };
  }
}

export interface PurchaseState {
  error?: string;
}

const PURCHASE_ERRORS: Record<string, string> = {
  invalid_number: 'That number is no longer valid. Search again.',
  invalid_forward_number: 'Enter a US or Canadian cell or office number to ring (not your new business number).',
  already_has_number: 'Your business already has a number.',
  purchase_failed: 'That number was just taken or could not be purchased. Pick another one.',
  platform_not_ready: "We can't buy phone numbers right now (the platform's phone provider account needs attention). You weren't charged. Please try again later.",
  save_failed: 'Something went wrong saving your number. You were not charged; please try again.',
};

export async function purchaseNumber(_prev: PurchaseState, formData: FormData): Promise<PurchaseState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can add a phone number.' };
  // Server-side gate: the status comes from the webhook-maintained column, which clients can't write.
  if (!canProvisionNumber(session.subscriptionStatus)) redirect('/onboarding');

  const forwardToNumber = normalizeNanpNumber(String(formData.get('forwardTo') ?? ''));
  if (!forwardToNumber) return { error: PURCHASE_ERRORS.invalid_forward_number };

  const limit = await rateLimiterFallback.limit(`number-purchase:${session.organizationId}`, 3, 300);
  if (!limit.success) return { error: 'Too many attempts. Wait a few minutes and try again.' };

  const result = await provisionNumber(
    { organizationId: session.organizationId, phoneNumber: String(formData.get('phoneNumber') ?? ''), forwardToNumber },
    getProvisioningDeps()
  );
  if (!result.ok) return { error: PURCHASE_ERRORS[result.error] };
  redirect('/dashboard?welcome=1');
}

export interface CheckoutState {
  error?: string;
}

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can manage billing.' };
  if (canProvisionNumber(session.subscriptionStatus)) redirect('/onboarding');

  const plan = formData.get('plan');
  if (!isPlanId(plan)) return { error: 'Choose a plan.' };
  const priceId = checkoutPriceFor(plan);
  if (!priceId && !serverEnv.useMockBilling()) return { error: 'Billing is not configured yet. Please contact support.' };

  const limit = await rateLimiterFallback.limit(`checkout:${session.organizationId}`, 5, 300);
  if (!limit.success) return { error: 'Too many attempts. Wait a few minutes and try again.' };

  let url: string;
  try {
    const appUrl = serverEnv.appUrl();
    ({ url } = await getBillingProvider().createCheckoutSession({
      organizationId: session.organizationId,
      customerId: session.stripeCustomerId ?? undefined,
      customerEmail: session.email,
      priceId: priceId ?? 'price_mock',
      setupFeePriceId: serverEnv.stripeSetupFeePriceId(),
      trialDays: serverEnv.stripeTrialDays(),
      successUrl: `${appUrl}/onboarding/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/onboarding?checkout=canceled`,
    }));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Checkout session creation failed', error: String(err) }));
    return { error: 'Could not start checkout. Please try again.' };
  }
  redirect(url);
}
