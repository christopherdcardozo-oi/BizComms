'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { canManage, requireOrganization } from '@/lib/auth/session';
import { planFeatures } from '@/lib/billing/plans';
import { PROFILE_LIMITS, TRADE_IDS } from '@/lib/business-profile';
import { billingAllowsService } from '@/lib/billing/status';
import { getVoiceAiProvider } from '@/lib/providers/voice-ai';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { provisionReceptionist } from '@/lib/voice/receptionist';
import { SupabaseReceptionistStore } from '@/lib/voice/supabase-receptionist-store';
import { serverEnv, webhookUrl } from '@/lib/config/env';
import { getBillingProvider } from '@/lib/providers/billing';
import { getPrimaryLine } from '@/lib/dashboard/queries';
import { failOpenUrlFor } from '@/lib/numbers/server';
import { normalizeNanpNumber } from '@/lib/numbers/phone';
import { getNumberProvisioningProvider } from '@/lib/providers/numbers';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { sendManualReply, type ManualReplyResult } from '@/lib/sms/outbound';
import { E164 } from '@/lib/telephony/rescue-sms';
import { US_TIMEZONES } from '@/lib/timezones';
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

export interface ReceptionistState {
  error?: string;
  saved?: boolean;
}

export async function updateReceptionist(_prev: ReceptionistState, formData: FormData): Promise<ReceptionistState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can change the AI receptionist.' };

  const enable = formData.get('intent') === 'enable';
  const afterHoursDirect = formData.get('afterHoursDirectToAi') === 'on';
  const line = await getPrimaryLine(session.supabase);
  if (!line) return { error: 'Add a business number first.' };

  if (enable) {
    if (!billingAllowsService(session.subscriptionStatus)) return { error: 'Your subscription is inactive. Update billing first.' };
    if (!planFeatures(session.stripePriceId).aiReceptionist) {
      return { error: 'The AI receptionist is included in the Receptionist and Complete plans. Change your plan under Billing below.' };
    }
    const limit = await rateLimiterFallback.limit(`receptionist:${session.organizationId}`, 5, 300);
    if (!limit.success) return { error: 'Too many attempts. Wait a few minutes and try again.' };

    const result = await provisionReceptionist(session.organizationId, {
      provider: getVoiceAiProvider(),
      store: new SupabaseReceptionistStore(getSupabaseAdmin()),
      sipHost: serverEnv.vapiSipEndpoint(),
      webhookUrl: webhookUrl('/api/vapi/webhook'),
    });
    if (!result.ok) return { error: 'Could not set up the AI receptionist. Please try again.' };
  }

  // Routing preference is client-writable through RLS + column grants.
  const { error } = await session.supabase
    .from('twilio_configs')
    .update({ ai_voice_enabled: enable, after_hours_direct_to_ai: enable && afterHoursDirect })
    .eq('id', line.id);
  if (error) return { error: 'Could not save. Please try again.' };

  revalidatePath('/dashboard/settings');
  return { saved: true };
}

export interface ProfileState {
  error?: string;
  saved?: boolean;
  aiUpdated?: boolean;
}

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid time.');

const profileSchema = z.object({
  timezone: z.enum(US_TIMEZONES),
  instructions: z.string().trim().max(1000, 'Keep instructions under 1,000 characters.'),
  hours: z.record(z.enum(WEEK), z.object({ open: hhmm, close: hhmm, closed: z.boolean() })),
  profile: z.object({
    trade: z.union([z.enum(TRADE_IDS), z.literal('')]),
    services: z.string().trim().max(PROFILE_LIMITS.services, `Keep services under ${PROFILE_LIMITS.services} characters.`),
    serviceArea: z.string().trim().max(PROFILE_LIMITS.serviceArea, `Keep the service area under ${PROFILE_LIMITS.serviceArea} characters.`),
    emergencies: z.string().trim().max(PROFILE_LIMITS.emergencies, `Keep urgent situations under ${PROFILE_LIMITS.emergencies} characters.`),
    askCallers: z.string().trim().max(PROFILE_LIMITS.askCallers, `Keep caller questions under ${PROFILE_LIMITS.askCallers} characters.`),
    reviewSignOff: z.string().trim().max(PROFILE_LIMITS.reviewSignOff, `Keep the sign-off under ${PROFILE_LIMITS.reviewSignOff} characters.`),
  }),
});

export async function updateBusinessProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can change business settings.' };

  const parsed = profileSchema.safeParse({
    timezone: formData.get('timezone'),
    instructions: String(formData.get('instructions') ?? ''),
    profile: {
      trade: String(formData.get('trade') ?? ''),
      services: String(formData.get('services') ?? ''),
      serviceArea: String(formData.get('serviceArea') ?? ''),
      emergencies: String(formData.get('emergencies') ?? ''),
      askCallers: String(formData.get('askCallers') ?? ''),
      reviewSignOff: String(formData.get('reviewSignOff') ?? ''),
    },
    hours: Object.fromEntries(
      WEEK.map((day) => [
        day,
        {
          open: String(formData.get(`${day}.open`) ?? ''),
          close: String(formData.get(`${day}.close`) ?? ''),
          closed: formData.get(`${day}.closed`) === 'on',
        },
      ])
    ),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Profile columns are client-writable through RLS + column grants (migration 20261022000000).
  const { error } = await session.supabase
    .from('organizations')
    .update({
      timezone: parsed.data.timezone,
      business_hours: parsed.data.hours,
      ai_receptionist_prompt: parsed.data.instructions || null,
      business_profile: parsed.data.profile,
    })
    .eq('id', session.organizationId);
  if (error) return { error: 'Could not save. Please try again.' };

  // Push new instructions to the live assistant if the receptionist is already set up.
  let aiUpdated = false;
  const { data: org } = await session.supabase.from('organizations').select('vapi_phone_number_id').eq('id', session.organizationId).single();
  if ((org as { vapi_phone_number_id: string | null } | null)?.vapi_phone_number_id) {
    const result = await provisionReceptionist(session.organizationId, {
      provider: getVoiceAiProvider(),
      store: new SupabaseReceptionistStore(getSupabaseAdmin()),
      sipHost: serverEnv.vapiSipEndpoint(),
      webhookUrl: webhookUrl('/api/vapi/webhook'),
    });
    if (!result.ok) return { saved: true, error: 'Saved, but the AI receptionist could not be updated. Try saving again.' };
    aiUpdated = true;
  }

  revalidatePath('/dashboard/settings');
  return { saved: true, aiUpdated };
}
