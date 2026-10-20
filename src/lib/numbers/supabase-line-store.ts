import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LineStore } from './provision';

// Service-role writes: clients can no longer insert twilio_configs (migration 20261021000000).
export class SupabaseLineStore implements LineStore {
  constructor(private admin: SupabaseClient) {}

  async organizationHasLine(organizationId: string): Promise<boolean> {
    const { count, error } = await this.admin
      .from('twilio_configs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    if (error) throw new Error(`organizationHasLine: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async insertPrimaryLine(input: { organizationId: string; twilioPhoneNumber: string; twilioPhoneSid: string; forwardToNumber: string }) {
    const { error } = await this.admin.from('twilio_configs').insert({
      organization_id: input.organizationId,
      label: 'Main Line',
      is_primary: true,
      twilio_phone_number: input.twilioPhoneNumber,
      twilio_phone_sid: input.twilioPhoneSid,
      forward_to_number: input.forwardToNumber,
      // Missed-call text-back plan: the AI receptionist stays off until it is sold separately.
      ai_voice_enabled: false,
      after_hours_direct_to_ai: false,
    });
    if (error) throw new Error(`insertPrimaryLine: ${error.message}`);
  }
}
