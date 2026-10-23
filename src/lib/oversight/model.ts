// AI oversight: what the automation did and why, what it is told, what it is allowed to do, and
// usage against the plan. Pure functions over plain rows, shared by /dashboard/ai and /demo/ai.
import type { CallOutcome, CallStatus } from '../../types/database.types';
import { formatDuration } from '../dashboard/format';

export interface CallFacts {
  id: string;
  status: CallStatus;
  outcome: CallOutcome | null;
  duration_seconds: number;
  sms_rescued: boolean;
  sms_rescue_result?: string | null;
  ai_summary: string | null;
  started_at: string | null;
  created_at: string;
  from_number: string;
}

const RESCUE_EXPLAINED: Record<string, string> = {
  sent: 'Texted the caller back from your business number.',
  failed: 'Tried to text the caller back, but the carrier rejected it.',
  disabled: 'Did not text back: text-back is turned off in Settings.',
  billing_inactive: 'Did not text back: the subscription is inactive.',
  invalid_caller: 'Did not text back: the caller ID was hidden or invalid.',
  opted_out: 'Did not text back: this caller had replied STOP before.',
  a2p_not_approved: 'Did not text back: business texting registration is not approved yet.',
  over_quota: "Did not text back: this month's text limit was reached.",
};

function rescueStep(call: CallFacts): string {
  if (call.sms_rescue_result) return RESCUE_EXPLAINED[call.sms_rescue_result] ?? 'Text-back decision recorded.';
  return call.sms_rescued ? RESCUE_EXPLAINED.sent : 'Did not text back.';
}

// The step-by-step story of one call, in plain language, from the rows the system wrote.
export function describeCallDecisions(call: CallFacts): string[] {
  const talk = call.duration_seconds > 0 ? ` (${formatDuration(call.duration_seconds)})` : '';
  const urgent = /^\s*urgent\b/i.test(call.ai_summary ?? '');
  switch (call.outcome) {
    case 'answered_by_business':
      return ['Rang your phone.', `You answered${talk}.`];
    case 'missed_call_texted':
      return ['Rang your phone. No answer.', rescueStep(call)];
    case 'caller_abandoned':
      return ['Rang your phone.', 'The caller hung up before you answered.', rescueStep(call)];
    case 'caller_abandoned_before_ai':
      return ['Sent to the AI receptionist.', 'The caller hung up before the AI picked up.', rescueStep(call)];
    case 'forwarded_to_ai':
      return ['Sent to the AI receptionist.', 'Waiting for the AI call report.'];
    case 'ai_conversation_completed':
      return [
        'Sent to the AI receptionist (no answer, or after hours).',
        `The AI answered and took the details${talk}. Callers are told it is an automated assistant and may be recorded.`,
        ...(call.ai_summary ? ['The AI wrote a summary for you.'] : []),
        ...(urgent ? ['Marked URGENT from what the caller described.'] : []),
        ...(call.sms_rescue_result ? [rescueStep(call)] : []),
      ];
    case 'voicemail':
      return ['Rang your phone.', 'The call went to voicemail.'];
    default:
      return call.status === 'completed' ? ['Call completed.'] : ['Call in progress.'];
  }
}

export type PermissionState = 'on' | 'off' | 'not_in_plan' | 'coming_soon' | 'never';

export interface Permission {
  label: string;
  state: PermissionState;
  detail: string;
  href?: string;
}

export interface PermissionInputs {
  plan: { aiReceptionist: boolean; reviews: boolean };
  ringSeconds: number;
  aiVoiceEnabled: boolean;
  afterHoursDirectToAi: boolean;
  missedCallSmsEnabled: boolean;
  ownerAlertsEnabled: boolean;
  google: { connected: boolean; autoReplyEnabled: boolean; autoPublishMinStars: number } | null;
}

// Everything the automation can do, whether it is allowed to right now, and the hard limits that
// no setting can turn on.
export function buildPermissions(p: PermissionInputs, settingsHref: string): Permission[] {
  const ai = (on: boolean) => (!p.plan.aiReceptionist ? 'not_in_plan' : on ? 'on' : 'off');
  const reviewsConnected = !!p.google?.connected;
  const reviews = (on: boolean): PermissionState => (!p.plan.reviews ? 'not_in_plan' : on ? 'on' : 'off');
  return [
    { label: 'Answer calls you miss', state: ai(p.aiVoiceEnabled), detail: `After your phone rings for ${p.ringSeconds} seconds, the AI receptionist picks up and takes the details.`, href: settingsHref },
    { label: 'Answer directly after hours', state: ai(p.aiVoiceEnabled && p.afterHoursDirectToAi), detail: 'Outside your business hours, calls go straight to the AI without ringing your phone.', href: settingsHref },
    { label: 'Record AI calls', state: ai(p.aiVoiceEnabled), detail: 'AI calls are recorded and transcribed for you. Callers are told at the start of every call.' },
    { label: 'Text back callers you miss', state: p.missedCallSmsEnabled ? 'on' : 'off', detail: 'One text per missed call, from your business number, with opt-out language.', href: settingsHref },
    { label: 'Text you about new leads', state: p.ownerAlertsEnabled ? 'on' : 'off', detail: 'Lead alerts and a 7am summary, sent to your forwarding number.', href: settingsHref },
    {
      label: 'Draft replies to Google reviews',
      state: reviews(reviewsConnected && !!p.google?.autoReplyEnabled),
      detail: reviewsConnected ? 'The AI drafts a reply to each new review.' : 'Google Business Profile is not connected.',
      href: `${settingsHref}#google`,
    },
    {
      label: 'Post review replies without asking you',
      state: reviews(reviewsConnected && !!p.google?.autoReplyEnabled),
      detail: `Only positive reviews with ${p.google?.autoPublishMinStars ?? 4} stars or more. Everything else waits for your approval.`,
      href: `${settingsHref}#google`,
    },
    { label: 'Book appointments on your calendar', state: 'coming_soon', detail: 'Not connected. When it is available, it will only offer times you mark as open, and you can turn it off.' },
    { label: 'Quote prices', state: 'never', detail: 'Built-in rule: the AI never quotes prices.' },
    { label: 'Promise appointment or arrival times', state: 'never', detail: 'Built-in rule: it says someone will follow up.' },
    { label: 'Give repair or technical advice', state: 'never', detail: 'Built-in rule. If anyone is in danger, it tells them to call 911.' },
    { label: 'Offer discounts, refunds or admit fault in reviews', state: 'never', detail: "Built-in rule, and against Google's policy." },
    { label: 'Text people who never contacted you', state: 'never', detail: 'No cold outreach: only callers and texters, and never after they reply STOP.' },
  ];
}

export interface FeedItem {
  at: string;
  kind: 'call' | 'alert' | 'review';
  title: string;
  steps: string[];
  href?: string;
  urgent?: boolean;
}

export interface AlertFacts {
  kind: 'missed_call' | 'ai_call' | 'text' | 'digest';
  created_at: string;
  urgent: boolean;
}

export interface ReviewFacts {
  id: string;
  reviewer_name: string;
  star_rating: number;
  reply_status: string;
  ai_model: string | null;
  review_created_at: string;
  reply_published_at: string | null;
  approved_by?: string | null;
}

const ALERT_TITLES: Record<AlertFacts['kind'], string> = {
  missed_call: 'Texted you about a missed call',
  ai_call: 'Texted you the AI call summary',
  text: 'Texted you about a new customer text',
  digest: 'Sent your 7am summary',
};

function reviewSteps(r: ReviewFacts): string[] {
  if (!r.ai_model) return ['Waiting for the AI to draft a reply.'];
  switch (r.reply_status) {
    case 'published':
      return ['The AI drafted a reply.', r.approved_by ? 'You approved it and it was posted to Google.' : 'Posted automatically (positive review, within your star setting).'];
    case 'manual_review':
      return ['The AI drafted a reply.', 'Waiting for your approval before anything is posted.'];
    case 'failed':
      return ['The AI could not draft or post a reply. It needs your attention.'];
    default:
      return ['The AI is working on a reply.'];
  }
}

export function buildFeed(
  input: { calls: CallFacts[]; alerts: AlertFacts[]; reviews: ReviewFacts[]; formatNumber: (n: string) => string; callHref: (id: string) => string; reviewsHref: string },
  limit = 40
): FeedItem[] {
  const items: FeedItem[] = [
    ...input.calls.map((c) => ({
      at: c.started_at ?? c.created_at,
      kind: 'call' as const,
      title: `Call from ${input.formatNumber(c.from_number)}`,
      steps: describeCallDecisions(c),
      href: input.callHref(c.id),
      urgent: /^\s*urgent\b/i.test(c.ai_summary ?? ''),
    })),
    ...input.alerts.map((a) => ({ at: a.created_at, kind: 'alert' as const, title: ALERT_TITLES[a.kind], steps: a.urgent ? ['Marked URGENT.'] : [], urgent: a.urgent })),
    ...input.reviews
      .filter((r) => r.ai_model || r.reply_status !== 'skipped')
      .map((r) => ({
        at: r.reply_published_at ?? r.review_created_at,
        kind: 'review' as const,
        title: `${r.reviewer_name}'s ${r.star_rating}-star Google review`,
        steps: reviewSteps(r),
        href: input.reviewsHref,
      })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export interface UsageMeter {
  label: string;
  used: number;
  limit: number | null;
  unit: string;
  note?: string;
}
