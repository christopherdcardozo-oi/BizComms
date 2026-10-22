import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { A2PStatus, CallOutcome, CallStatus } from '../../types/database.types';
import type { BusinessHours } from '../telephony/business-hours';
import type { InboxMessage } from './conversations';

// Every query here runs through the signed-in user's RLS client: tenant isolation is enforced
// by Postgres, not by these filters.

export interface PrimaryLine {
  id: string;
  twilio_phone_number: string;
  twilio_phone_sid: string | null;
  forward_to_number: string;
  forward_timeout_seconds: number;
  missed_call_sms_enabled: boolean;
  missed_call_sms_template: string;
  ai_voice_enabled: boolean;
  after_hours_direct_to_ai: boolean;
  owner_alerts_enabled: boolean;
}

export interface CallLogRow {
  id: string;
  from_number: string;
  status: CallStatus;
  outcome: CallOutcome | null;
  duration_seconds: number;
  sms_rescued: boolean;
  ai_summary: string | null;
  started_at: string | null;
  created_at: string;
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export async function getPrimaryLine(db: SupabaseClient): Promise<PrimaryLine | null> {
  const { data, error } = await db
    .from('twilio_configs')
    .select(
      'id, twilio_phone_number, twilio_phone_sid, forward_to_number, forward_timeout_seconds, missed_call_sms_enabled, missed_call_sms_template, ai_voice_enabled, after_hours_direct_to_ai, owner_alerts_enabled'
    )
    .eq('is_primary', true)
    .maybeSingle();
  if (error) fail('getPrimaryLine', error);
  return data as PrimaryLine | null;
}

export async function getOrganizationDetails(db: SupabaseClient, organizationId: string) {
  const { data, error } = await db
    .from('organizations')
    .select('name, timezone, business_hours, ai_receptionist_prompt, vapi_phone_number_id, business_profile')
    .eq('id', organizationId)
    .single();
  if (error) fail('getOrganizationDetails', error);
  return data as {
    name: string;
    timezone: string;
    business_hours: BusinessHours | null;
    ai_receptionist_prompt: string | null;
    vapi_phone_number_id: string | null;
    business_profile: unknown;
  };
}

export async function getA2pStatus(db: SupabaseClient): Promise<A2PStatus> {
  const { data, error } = await db.from('a2p_registrations').select('status').maybeSingle();
  if (error) fail('getA2pStatus', error);
  return (data as { status: A2PStatus } | null)?.status ?? 'unregistered';
}

export async function listCallLogs(db: SupabaseClient, limit = 100): Promise<CallLogRow[]> {
  const { data, error } = await db
    .from('call_logs')
    .select('id, from_number, status, outcome, duration_seconds, sms_rescued, ai_summary, started_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('listCallLogs', error);
  return (data ?? []) as CallLogRow[];
}

export async function getMonthStats(db: SupabaseClient) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [calls, rescued, usage, won] = await Promise.all([
    db.from('call_logs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    db.from('call_logs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).eq('sms_rescued', true),
    db.from('usage_records').select('sms_messages_sent').eq('billing_period_start', monthStart).maybeSingle(),
    db.from('jobs_won').select('amount_cents').gte('created_at', monthStart),
  ]);
  if (calls.error) fail('getMonthStats calls', calls.error);
  if (rescued.error) fail('getMonthStats rescued', rescued.error);
  return {
    calls: calls.count ?? 0,
    rescued: rescued.count ?? 0,
    textsSent: (usage.data as { sms_messages_sent: number } | null)?.sms_messages_sent ?? 0,
    // Jobs the owner logged as won ("won 650" by text). Missing table on an old DB reads as zero.
    recoveredCents: ((won.data ?? []) as Array<{ amount_cents: number | null }>).reduce((s, r) => s + (r.amount_cents ?? 0), 0),
  };
}

const MESSAGE_COLUMNS = 'id, direction, from_number, to_number, body, status, type, error_code, created_at';

export async function listRecentMessages(db: SupabaseClient, limit = 500): Promise<InboxMessage[]> {
  // Owner alerts and the owner's command texts (type system_alert) are not customer conversations.
  const { data, error } = await db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .neq('type', 'system_alert')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('listRecentMessages', error);
  return (data ?? []) as InboxMessage[];
}

export async function getThread(db: SupabaseClient, contact: string): Promise<InboxMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .or(`and(direction.eq.inbound,from_number.eq.${contact}),and(direction.eq.outbound_api,to_number.eq.${contact})`)
    .neq('type', 'system_alert')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) fail('getThread', error);
  return (data ?? []) as InboxMessage[];
}

export async function isContactOptedOut(db: SupabaseClient, contact: string): Promise<boolean> {
  const { data, error } = await db.from('sms_opt_outs').select('id').eq('phone_number', contact).maybeSingle();
  if (error) fail('isContactOptedOut', error);
  return data !== null;
}

export interface CallDetail extends CallLogRow {
  to_number: string;
  transcript: string | null;
  recording_url: string | null;
  vapi_ended_reason: string | null;
  ended_at: string | null;
}

export async function getCallDetail(db: SupabaseClient, id: string): Promise<CallDetail | null> {
  const { data, error } = await db
    .from('call_logs')
    .select('id, from_number, to_number, status, outcome, duration_seconds, sms_rescued, ai_summary, transcript, recording_url, vapi_ended_reason, started_at, ended_at, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('getCallDetail', error);
  return data as CallDetail | null;
}

export interface GoogleConnection {
  google_location_id: string | null;
  location_name: string | null;
  auto_reply_enabled: boolean;
  auto_reply_min_stars: number;
  auto_publish_min_stars: number;
  reply_tone: string;
  custom_reply_instructions: string | null;
  last_synced_at: string | null;
}

export async function getGoogleConnection(db: SupabaseClient): Promise<GoogleConnection | null> {
  const { data, error } = await db
    .from('google_configs_safe')
    .select('google_location_id, location_name, auto_reply_enabled, auto_reply_min_stars, auto_publish_min_stars, reply_tone, custom_reply_instructions, last_synced_at')
    .maybeSingle();
  if (error) fail('getGoogleConnection', error);
  return data as GoogleConnection | null;
}

export interface ReviewRow {
  id: string;
  reviewer_name: string;
  star_rating: number;
  comment: string | null;
  review_created_at: string;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  reply_text: string | null;
  reply_status: 'pending' | 'generating' | 'manual_review' | 'published' | 'failed' | 'skipped';
  reply_published_at: string | null;
  reply_error: string | null;
  ai_model: string | null;
}

export async function listReviews(db: SupabaseClient, limit = 100): Promise<ReviewRow[]> {
  const { data, error } = await db
    .from('reviews')
    .select('id, reviewer_name, star_rating, comment, review_created_at, sentiment, reply_text, reply_status, reply_published_at, reply_error, ai_model')
    .order('review_created_at', { ascending: false })
    .limit(limit);
  if (error) fail('listReviews', error);
  const rows = (data ?? []) as ReviewRow[];
  // Reviews waiting on the owner first, then everything else newest-first.
  const needsAttention = (r: ReviewRow) => r.reply_status === 'manual_review' || r.reply_status === 'failed';
  return [...rows.filter(needsAttention), ...rows.filter((r) => !needsAttention(r))];
}

// Talk time on calls the owner answered on their own phone this calendar month (UTC), in whole
// minutes. Used for the Text-Back fair-use allowance; RLS limits it to the caller's organization.
export async function getForwardedMinutesThisMonth(db: SupabaseClient, now: Date = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await db
    .from('call_logs')
    .select('duration_seconds')
    .eq('outcome', 'answered_by_business')
    .gte('started_at', monthStart);
  if (error) fail('getForwardedMinutesThisMonth', error);
  const seconds = ((data ?? []) as Array<{ duration_seconds: number | null }>).reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);
  return Math.ceil(seconds / 60);
}
