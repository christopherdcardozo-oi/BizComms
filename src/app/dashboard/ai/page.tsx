import { OversightView } from '@/components/dashboard/ai-views';
import { requireOrganization } from '@/lib/auth/session';
import { FORWARDED_MINUTES_FAIR_USE, PLAN_NAMES, planFeatures, planForPrice } from '@/lib/billing/plans';
import { describeSubscription } from '@/lib/billing/status';
import { parseBusinessProfile } from '@/lib/business-profile';
import {
  getForwardedMinutesThisMonth,
  getGoogleConnection,
  getMonthStats,
  getOrganizationDetails,
  getPrimaryLine,
  getUsageThisMonth,
  listCallFacts,
  listOwnerAlerts,
  listReviewFacts,
} from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';
import { buildFeed, buildPermissions, type UsageMeter } from '@/lib/oversight/model';
import { buildPromptBlocks } from '@/lib/oversight/prompts';

export const metadata = { title: 'Your AI · BizComms' };

export default async function AiOversightPage() {
  const session = await requireOrganization();
  const plan = planForPrice(session.stripePriceId);
  const features = planFeatures(session.stripePriceId);
  const fairUse = FORWARDED_MINUTES_FAIR_USE[plan];
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [line, org, google, usage, stats, calls, alerts, reviews, forwarded] = await Promise.all([
    getPrimaryLine(session.supabase),
    getOrganizationDetails(session.supabase, session.organizationId),
    getGoogleConnection(session.supabase),
    getUsageThisMonth(session.supabase, session.organizationId),
    getMonthStats(session.supabase),
    listCallFacts(session.supabase, since),
    listOwnerAlerts(session.supabase, since),
    listReviewFacts(session.supabase, since),
    fairUse ? getForwardedMinutesThisMonth(session.supabase) : Promise.resolve(0),
  ]);
  const profile = parseBusinessProfile(org.business_profile);

  const meters: UsageMeter[] = [
    ...(features.aiReceptionist ? [{ label: 'AI receptionist minutes', used: usage.aiMinutes, limit: usage.aiMinutesLimit, unit: 'min' }] : []),
    { label: 'Texts sent (all automatic and manual)', used: usage.texts, limit: usage.textsLimit, unit: 'texts' },
    ...(fairUse ? [{ label: 'Forwarded call minutes', used: forwarded, limit: fairUse, unit: 'min', note: 'Fair-use allowance. Calls are never blocked.' }] : []),
    { label: 'Lead alerts texted to you', used: usage.ownerAlerts, limit: null, unit: 'texts' },
    ...(features.reviews ? [{ label: 'Review replies drafted by AI', used: usage.reviewDrafts, limit: null, unit: 'replies' }] : []),
    { label: 'Recovered (jobs you logged)', used: Math.round((stats.recoveredCents ?? 0) / 100), limit: null, unit: 'dollars' },
  ];

  return (
    <OversightView
      planName={PLAN_NAMES[plan]}
      statusLabel={describeSubscription(session.subscriptionStatus)}
      usage={meters}
      timezone={org.timezone}
      feed={buildFeed({
        calls,
        alerts,
        reviews,
        formatNumber: formatNanp,
        callHref: (id) => `/dashboard/calls/${id}`,
        reviewsHref: '/dashboard/reviews',
      })}
      permissions={buildPermissions(
        {
          plan: features,
          ringSeconds: line?.forward_timeout_seconds ?? 15,
          aiVoiceEnabled: !!line?.ai_voice_enabled,
          afterHoursDirectToAi: !!line?.after_hours_direct_to_ai,
          missedCallSmsEnabled: !!line?.missed_call_sms_enabled,
          ownerAlertsEnabled: line?.owner_alerts_enabled ?? true,
          google: google
            ? { connected: !!google.google_location_id, autoReplyEnabled: google.auto_reply_enabled, autoPublishMinStars: google.auto_publish_min_stars }
            : null,
        },
        '/dashboard/settings'
      )}
      prompts={buildPromptBlocks({
        businessName: org.name,
        ownerInstructions: org.ai_receptionist_prompt,
        profile,
        hours: org.business_hours,
        timezone: org.timezone,
        textBackTemplate: line?.missed_call_sms_template ?? null,
        review: features.reviews && google ? { tone: google.reply_tone, customInstructions: google.custom_reply_instructions } : null,
      })}
    />
  );
}
