import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { A2PStatus, CallOutcome, CallStatus } from '../../types/database.types';
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
}

export interface CallLogRow {
  id: string;
  from_number: string;
  status: CallStatus;
  outcome: CallOutcome | null;
  duration_seconds: number;
  sms_rescued: boolean;
  started_at: string | null;
  created_at: string;
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export async function getPrimaryLine(db: SupabaseClient): Promise<PrimaryLine | null> {
  const { data, error } = await db
    .from('twilio_configs')
    .select('id, twilio_phone_number, twilio_phone_sid, forward_to_number, forward_timeout_seconds, missed_call_sms_enabled, missed_call_sms_template')
    .eq('is_primary', true)
    .maybeSingle();
  if (error) fail('getPrimaryLine', error);
  return data as PrimaryLine | null;
}

export async function getOrganizationDetails(db: SupabaseClient, organizationId: string) {
  const { data, error } = await db.from('organizations').select('name, timezone').eq('id', organizationId).single();
  if (error) fail('getOrganizationDetails', error);
  return data as { name: string; timezone: string };
}

export async function getA2pStatus(db: SupabaseClient): Promise<A2PStatus> {
  const { data, error } = await db.from('a2p_registrations').select('status').maybeSingle();
  if (error) fail('getA2pStatus', error);
  return (data as { status: A2PStatus } | null)?.status ?? 'unregistered';
}

export async function listCallLogs(db: SupabaseClient, limit = 100): Promise<CallLogRow[]> {
  const { data, error } = await db
    .from('call_logs')
    .select('id, from_number, status, outcome, duration_seconds, sms_rescued, started_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('listCallLogs', error);
  return (data ?? []) as CallLogRow[];
}

export async function getMonthStats(db: SupabaseClient) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [calls, rescued, usage] = await Promise.all([
    db.from('call_logs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    db.from('call_logs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).eq('sms_rescued', true),
    db.from('usage_records').select('sms_messages_sent').eq('billing_period_start', monthStart).maybeSingle(),
  ]);
  if (calls.error) fail('getMonthStats calls', calls.error);
  if (rescued.error) fail('getMonthStats rescued', rescued.error);
  return {
    calls: calls.count ?? 0,
    rescued: rescued.count ?? 0,
    textsSent: (usage.data as { sms_messages_sent: number } | null)?.sms_messages_sent ?? 0,
  };
}

const MESSAGE_COLUMNS = 'id, direction, from_number, to_number, body, status, type, error_code, created_at';

export async function listRecentMessages(db: SupabaseClient, limit = 500): Promise<InboxMessage[]> {
  const { data, error } = await db.from('messages').select(MESSAGE_COLUMNS).order('created_at', { ascending: false }).limit(limit);
  if (error) fail('listRecentMessages', error);
  return (data ?? []) as InboxMessage[];
}

export async function getThread(db: SupabaseClient, contact: string): Promise<InboxMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .or(`and(direction.eq.inbound,from_number.eq.${contact}),and(direction.eq.outbound_api,to_number.eq.${contact})`)
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
