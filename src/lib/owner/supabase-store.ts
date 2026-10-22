import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LineConfig } from '../telephony/types';
import type { DayStats, DigestStore } from './digest';
import type { AlertClaim, LatestLead, OwnerStore } from './types';

function check<T>(result: { data: T; error: { message: string; code?: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

// Service role: owner_alerts and jobs_won are read-only for clients (migration 20261028000000).
export class SupabaseOwnerStore implements OwnerStore {
  constructor(private db: SupabaseClient) {}

  async claimAlert(claim: AlertClaim): Promise<boolean> {
    const inserted = check(
      await this.db
        .from('owner_alerts')
        .upsert(
          {
            organization_id: claim.organizationId,
            kind: claim.kind,
            dedupe_key: claim.dedupeKey,
            contact_number: claim.contactNumber,
            call_sid: claim.callSid,
            urgent: claim.urgent,
          },
          { onConflict: 'organization_id,dedupe_key', ignoreDuplicates: true }
        )
        .select('id'),
      'claimAlert'
    ) as { id: string }[] | null;
    return !!inserted && inserted.length > 0;
  }

  async latestLead(organizationId: string, sinceIso: string): Promise<LatestLead | null> {
    const row = check(
      await this.db
        .from('owner_alerts')
        .select('kind, contact_number, call_sid, urgent')
        .eq('organization_id', organizationId)
        .neq('kind', 'digest')
        .not('contact_number', 'is', null)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      'latestLead'
    ) as { kind: LatestLead['kind']; contact_number: string; call_sid: string | null; urgent: boolean } | null;
    return row ? { kind: row.kind, contactNumber: row.contact_number, callSid: row.call_sid, urgent: row.urgent } : null;
  }

  async recordJobWon(input: { organizationId: string; contactNumber: string | null; callSid: string | null; amountCents: number | null }) {
    check(
      await this.db.from('jobs_won').insert({
        organization_id: input.organizationId,
        contact_number: input.contactNumber,
        call_sid: input.callSid,
        amount_cents: input.amountCents,
        source: 'owner_text',
      }),
      'recordJobWon'
    );
  }

  async recoveredCents(organizationId: string, sinceIso: string): Promise<number> {
    const rows = check(
      await this.db.from('jobs_won').select('amount_cents').eq('organization_id', organizationId).gte('created_at', sinceIso),
      'recoveredCents'
    ) as Array<{ amount_cents: number | null }> | null;
    return (rows ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  }
}

type DigestLineRow = {
  id: string;
  organization_id: string;
  twilio_phone_number: string;
  forward_to_number: string;
  organizations: { name: string; timezone: string; subscription_status: string | null };
};

// Service role. Lines that get owner alerts, and yesterday's numbers for the morning text.
export class SupabaseDigestStore implements DigestStore {
  private owner: SupabaseOwnerStore;
  constructor(private db: SupabaseClient) {
    this.owner = new SupabaseOwnerStore(db);
  }

  async listAlertLines(): Promise<LineConfig[]> {
    const rows = check(
      await this.db
        .from('twilio_configs')
        .select('id, organization_id, twilio_phone_number, forward_to_number, organizations!inner(name, timezone, subscription_status)')
        .eq('is_primary', true)
        .eq('owner_alerts_enabled', true),
      'listAlertLines'
    ) as unknown as DigestLineRow[] | null;
    // Only the fields owner alerts use; the rest of LineConfig is irrelevant to a digest.
    return (rows ?? []).map(
      (r) =>
        ({
          configId: r.id,
          organizationId: r.organization_id,
          twilioPhoneNumber: r.twilio_phone_number,
          forwardToNumber: r.forward_to_number,
          businessName: r.organizations.name,
          timezone: r.organizations.timezone,
          subscriptionStatus: r.organizations.subscription_status,
          ownerAlertsEnabled: true,
        }) as LineConfig
    );
  }

  async dayStats(organizationId: string, sinceIso: string, untilIso: string): Promise<DayStats> {
    const calls = check(
      await this.db
        .from('call_logs')
        .select('outcome, sms_rescued')
        .eq('organization_id', organizationId)
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso),
      'dayStats calls'
    ) as Array<{ outcome: string | null; sms_rescued: boolean }> | null;
    const weekAgo = new Date(new Date(untilIso).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const messages = check(
      await this.db
        .from('messages')
        .select('direction, from_number, to_number')
        .eq('organization_id', organizationId)
        .neq('type', 'system_alert')
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(1000),
      'dayStats messages'
    ) as Array<{ direction: string; from_number: string; to_number: string }> | null;
    const latestByContact = new Map<string, string>();
    for (const m of messages ?? []) {
      const contact = m.direction === 'inbound' ? m.from_number : m.to_number;
      if (!latestByContact.has(contact)) latestByContact.set(contact, m.direction);
    }
    const list = calls ?? [];
    return {
      calls: list.length,
      textedBack: list.filter((c) => c.sms_rescued).length,
      aiCalls: list.filter((c) => c.outcome === 'ai_conversation_completed').length,
      waiting: [...latestByContact.values()].filter((d) => d === 'inbound').length,
    };
  }

  recoveredCents(organizationId: string, sinceIso: string): Promise<number> {
    return this.owner.recoveredCents(organizationId, sinceIso);
  }
}
