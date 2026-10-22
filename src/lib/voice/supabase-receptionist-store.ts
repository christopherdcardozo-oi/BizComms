import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessHours } from '../telephony/business-hours';
import type { ReceptionistStore } from './receptionist';

// Service role: vapi_* columns are not client-writable (migration 20261022000000).
export class SupabaseReceptionistStore implements ReceptionistStore {
  constructor(private admin: SupabaseClient) {}

  async getOrganization(organizationId: string) {
    const { data, error } = await this.admin
      .from('organizations')
      .select('name, ai_receptionist_prompt, vapi_assistant_id, vapi_phone_number_id, business_profile, business_hours, timezone')
      .eq('id', organizationId)
      .maybeSingle();
    if (error) throw new Error(`getOrganization: ${error.message}`);
    const row = data as {
      name: string;
      ai_receptionist_prompt: string | null;
      vapi_assistant_id: string | null;
      vapi_phone_number_id: string | null;
      business_profile: unknown;
      business_hours: BusinessHours | null;
      timezone: string;
    } | null;
    return row
      ? {
          name: row.name,
          aiReceptionistPrompt: row.ai_receptionist_prompt,
          vapiAssistantId: row.vapi_assistant_id,
          vapiPhoneNumberId: row.vapi_phone_number_id,
          businessProfile: row.business_profile,
          businessHours: row.business_hours,
          timezone: row.timezone,
        }
      : null;
  }

  async saveVapiIds(organizationId: string, ids: { assistantId: string; phoneNumberId: string }) {
    const { error } = await this.admin
      .from('organizations')
      .update({ vapi_assistant_id: ids.assistantId, vapi_phone_number_id: ids.phoneNumberId })
      .eq('id', organizationId);
    if (error) throw new Error(`saveVapiIds: ${error.message}`);
  }
}
