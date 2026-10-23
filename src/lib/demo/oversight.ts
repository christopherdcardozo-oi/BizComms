// Sample AI oversight data for the public demo, built from the same demo calls and reviews.
import type { OversightProps } from '@/components/dashboard/ai-views';
import { parseBusinessProfile, TRADE_PRESETS } from '../business-profile';
import { formatNanp } from '../numbers/phone';
import { buildFeed, buildPermissions, type AlertFacts } from '../oversight/model';
import { buildPromptBlocks } from '../oversight/prompts';
import { buildDemoData } from './data';

const WEEKDAY = { open: '07:00', close: '17:00' };
const DEMO_HOURS = { monday: WEEKDAY, tuesday: WEEKDAY, wednesday: WEEKDAY, thursday: WEEKDAY, friday: WEEKDAY, saturday: { open: '08:00', close: '12:00' }, sunday: { open: '00:00', close: '00:00', closed: true } };

export function buildDemoOversight(now: Date = new Date()): OversightProps {
  const { business, calls, reviews, stats } = buildDemoData(now);
  const profile = parseBusinessProfile({
    trade: 'plumbing',
    services: TRADE_PRESETS.plumbing.services,
    serviceArea: 'Ames, Ankeny, Nevada and Boone',
    emergencies: TRADE_PRESETS.plumbing.emergencies,
    askCallers: TRADE_PRESETS.plumbing.askCallers,
    reviewSignOff: 'The Acme team',
  });
  // Alerts the owner would have received for these calls.
  const alerts: AlertFacts[] = calls.flatMap((c): AlertFacts[] =>
    c.outcome === 'ai_conversation_completed'
      ? [{ kind: 'ai_call', created_at: c.ended_at ?? c.created_at, urgent: /^\s*urgent\b/i.test(c.ai_summary ?? '') }]
      : c.sms_rescued
        ? [{ kind: 'missed_call', created_at: c.ended_at ?? c.created_at, urgent: false }]
        : []
  );
  return {
    planName: 'Complete',
    statusLabel: 'Active',
    timezone: business.timezone,
    usage: [
      { label: 'AI receptionist minutes', used: 38, limit: 200, unit: 'min' },
      { label: 'Texts sent (all automatic and manual)', used: stats.textsSent, limit: 500, unit: 'texts' },
      { label: 'Lead alerts texted to you', used: 18, limit: null, unit: 'texts' },
      { label: 'Review replies drafted by AI', used: 6, limit: null, unit: 'replies' },
      { label: 'Recovered (jobs you logged)', used: Math.round((stats.recoveredCents ?? 0) / 100), limit: null, unit: 'dollars' },
    ],
    feed: buildFeed({
      calls,
      alerts,
      reviews: reviews.map((r) => ({ ...r, approved_by: null })),
      formatNumber: formatNanp,
      callHref: (id) => `/demo/calls/${id}`,
      reviewsHref: '/demo/reviews',
    }),
    permissions: buildPermissions(
      {
        plan: { aiReceptionist: true, reviews: true },
        ringSeconds: 15,
        aiVoiceEnabled: true,
        afterHoursDirectToAi: true,
        missedCallSmsEnabled: true,
        ownerAlertsEnabled: true,
        google: { connected: true, autoReplyEnabled: true, autoPublishMinStars: 4 },
      },
      '/demo'
    ).map((p) => ({ ...p, href: undefined })),
    prompts: buildPromptBlocks({
      businessName: business.name,
      ownerInstructions: null,
      profile,
      hours: DEMO_HOURS,
      timezone: business.timezone,
      textBackTemplate: `Hi, this is {{business_name}}! Sorry we missed your call. How can we help you today?`,
      review: { tone: 'friendly and down-to-earth', customInstructions: null },
    }),
  };
}
