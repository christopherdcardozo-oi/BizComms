import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LapsedLine, ReleaseStore } from './release';

interface LapsedRow {
  id: string;
  organization_id: string;
  twilio_phone_number: string;
  twilio_phone_sid: string | null;
}

export class SupabaseReleaseStore implements ReleaseStore {
  constructor(private admin: SupabaseClient) {}

  async findLapsedLines(statuses: readonly string[], changedBefore: string, limit: number): Promise<LapsedLine[]> {
    const { data, error } = await this.admin
      .from('twilio_configs')
      .select('id, organization_id, twilio_phone_number, twilio_phone_sid, organizations!inner(subscription_status, subscription_status_changed_at)')
      .in('organizations.subscription_status', [...statuses])
      .lt('organizations.subscription_status_changed_at', changedBefore)
      .limit(limit);
    if (error) throw new Error(`findLapsedLines: ${error.message}`);
    return ((data ?? []) as unknown as LapsedRow[]).map((row) => ({
      configId: row.id,
      organizationId: row.organization_id,
      twilioPhoneNumber: row.twilio_phone_number,
      twilioPhoneSid: row.twilio_phone_sid,
    }));
  }

  async isStillLapsed(organizationId: string, statuses: readonly string[], changedBefore: string): Promise<boolean> {
    const { data, error } = await this.admin
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .in('subscription_status', [...statuses])
      .lt('subscription_status_changed_at', changedBefore)
      .maybeSingle();
    if (error) throw new Error(`isStillLapsed: ${error.message}`);
    return data !== null;
  }

  async deleteLine(configId: string, organizationId: string): Promise<void> {
    const { error } = await this.admin.from('twilio_configs').delete().eq('id', configId).eq('organization_id', organizationId);
    if (error) throw new Error(`deleteLine: ${error.message}`);
  }
}
