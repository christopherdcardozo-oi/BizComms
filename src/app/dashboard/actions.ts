'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { canManage, requireOrganization } from '@/lib/auth/session';
import { serverEnv } from '@/lib/config/env';
import { getBillingProvider } from '@/lib/providers/billing';
import { getPrimaryLine } from '@/lib/dashboard/queries';
import { failOpenUrlFor } from '@/lib/numbers/server';
import { normalizeNanpNumber } from '@/lib/numbers/phone';
import { getNumberProvisioningProvider } from '@/lib/providers/numbers';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { sendManualReply, type ManualReplyResult } from '@/lib/sms/outbound';
import { E164 } from '@/lib/telephony/rescue-sms';
import { getTelephonyDeps } from '@/lib/telephony/deps';

export interface ReplyState {
  error?: string;
  sentAt?: number;
}

const REPLY_ERRORS: Record<Exclude<ManualReplyResult, { ok: true }>['error'], string> = {
  empty: 'Type a message first.',
  too_long: 'Keep replies under 640 characters.',
  invalid_recipient: 'That phone number is not valid.',
  billing_inactive: 'Your subscription is inactive. Update billing in Settings to resume texting.',
  no_prior_contact: 'You can only text people who have called or texted your business.',
  opted_out: 'This customer opted out of texts. They must text START to opt back in.',
  a2p_not_approved: 'Texting is paused until your carrier registration (A2P 10DLC) is approved.',
  over_quota: "You've reached this month's text limit.",
  disabled: 'Texting is temporarily disabled.',
  send_failed: 'The text could not be sent. Please try again.',
};

export async function replyToConversation(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const session = await requireOrganization();
  const to = String(formData.get('to') ?? '');
  if (!E164.test(to)) return { error: REPLY_ERRORS.invalid_recipient };

  const limit = await rateLimiterFallback.limit(`reply:${session.userId}`, 20, 60);
  if (!limit.success) return { error: 'Slow down: too many messages in a minute.' };

  const line = await getPrimaryLine(session.supabase);
  if (!line) return { error: 'Add a business number before texting customers.' };

  const result = await sendManualReply(
    {
      organizationId: session.organizationId,
      fromNumber: line.twilio_phone_number,
      to,
      body: String(formData.get('body') ?? ''),
      subscriptionStatus: session.subscriptionStatus,
    },
    getTelephonyDeps()
  );
  if (!result.ok) return { error: REPLY_ERRORS[result.error] };

  revalidatePath(`/dashboard/inbox/${encodeURIComponent(to)}`);
  revalidatePath('/dashboard/inbox');
  return { sentAt: Date.now() };
}

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

const settingsSchema = z.object({
  forwardTimeoutSeconds: z.coerce.number().int().min(5).max(60),
  missedCallSmsEnabled: z.boolean(),
  missedCallSmsTemplate: z.string().trim().min(1, 'The text-back message cannot be empty.').max(300, 'Keep the message under 300 characters.'),
});

export async function updateLineSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can change settings.' };

  const forwardToNumber = normalizeNanpNumber(String(formData.get('forwardTo') ?? ''));
  if (!forwardToNumber) return { error: 'Enter a valid US or Canadian phone number to ring.' };
  const parsed = settingsSchema.safeParse({
    forwardTimeoutSeconds: formData.get('forwardTimeoutSeconds'),
    missedCallSmsEnabled: formData.get('missedCallSmsEnabled') === 'on',
    missedCallSmsTemplate: formData.get('missedCallSmsTemplate'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const line = await getPrimaryLine(session.supabase);
  if (!line) return { error: 'Add a business number first.' };
  if (forwardToNumber === line.twilio_phone_number) return { error: "Don't forward your business number to itself." };

  // Written as the user: RLS + column grants decide what may change (migration 20261021000000).
  const { error } = await session.supabase
    .from('twilio_configs')
    .update({
      forward_to_number: forwardToNumber,
      forward_timeout_seconds: parsed.data.forwardTimeoutSeconds,
      missed_call_sms_enabled: parsed.data.missedCallSmsEnabled,
      missed_call_sms_template: parsed.data.missedCallSmsTemplate,
    })
    .eq('id', line.id);
  if (error) return { error: 'Could not save settings. Please check the values and try again.' };

  // The fail-open URL is signed for one destination, so it must follow the forwarding number.
  if (forwardToNumber !== line.forward_to_number && line.twilio_phone_sid) {
    const fallback = failOpenUrlFor(forwardToNumber);
    if (fallback) {
      try {
        await getNumberProvisioningProvider().updateVoiceFallback(line.twilio_phone_sid, fallback);
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', message: 'Updating VoiceFallbackUrl failed', sid: line.twilio_phone_sid, error: String(err) }));
        return { saved: true, error: 'Saved, but the backup routing could not be updated. Support has been notified.' };
      }
    }
  }

  revalidatePath('/dashboard/settings');
  return { saved: true };
}

export interface BillingPortalState {
  error?: string;
}

export async function openBillingPortal(_prev: BillingPortalState): Promise<BillingPortalState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can manage billing.' };
  if (!session.stripeCustomerId) redirect('/onboarding');

  let url: string;
  try {
    ({ url } = await getBillingProvider().createPortalSession(session.stripeCustomerId, `${serverEnv.appUrl()}/dashboard/settings`));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Billing portal session failed', error: String(err) }));
    return { error: 'Could not open billing. Please try again.' };
  }
  redirect(url);
}
