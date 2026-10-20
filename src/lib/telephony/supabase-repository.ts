import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { A2PStatus, MessageStatus, OptOutSource } from '../../types/database.types';
import type { BusinessHours } from './business-hours';
import type {
  CallLogUpsert,
  CallRepository,
  InboundMessageRecord,
  LineConfig,
  OutboundMessageRecord,
  UsageStatus,
} from './types';

const TERMINAL_MESSAGE_STATUSES = ['delivered', 'undelivered', 'failed', 'received'];

interface LineRow {
  id: string;
  organization_id: string;
  twilio_phone_number: string;
  forward_to_number: string;
  forward_timeout_seconds: number;
  abandon_threshold_seconds: number;
  missed_call_sms_enabled: boolean;
  missed_call_sms_template: string;
  ai_voice_enabled: boolean;
  after_hours_direct_to_ai: boolean;
  organizations: {
    name: string;
    timezone: string;
    business_hours: BusinessHours | null;
    vapi_assistant_id: string | null;
    subscription_status: string | null;
  };
}

function check<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export class SupabaseCallRepository implements CallRepository {
  constructor(private db: SupabaseClient) {}

  async findLineByNumber(twilioPhoneNumber: string): Promise<LineConfig | null> {
    const row = check(
      await this.db
        .from('twilio_configs')
        .select(
          'id, organization_id, twilio_phone_number, forward_to_number, forward_timeout_seconds, abandon_threshold_seconds, ' +
            'missed_call_sms_enabled, missed_call_sms_template, ai_voice_enabled, after_hours_direct_to_ai, ' +
            'organizations!inner(name, timezone, business_hours, vapi_assistant_id, subscription_status)'
        )
        .eq('twilio_phone_number', twilioPhoneNumber)
        .maybeSingle(),
      'findLineByNumber'
    ) as unknown as LineRow | null;
    if (!row) return null;
    return {
      configId: row.id,
      organizationId: row.organization_id,
      twilioPhoneNumber: row.twilio_phone_number,
      forwardToNumber: row.forward_to_number,
      forwardTimeoutSeconds: row.forward_timeout_seconds,
      abandonThresholdSeconds: row.abandon_threshold_seconds,
      missedCallSmsEnabled: row.missed_call_sms_enabled,
      missedCallSmsTemplate: row.missed_call_sms_template,
      aiVoiceEnabled: row.ai_voice_enabled,
      afterHoursDirectToAi: row.after_hours_direct_to_ai,
      businessName: row.organizations.name,
      timezone: row.organizations.timezone,
      businessHours: row.organizations.business_hours,
      vapiAssistantId: row.organizations.vapi_assistant_id,
      subscriptionStatus: row.organizations.subscription_status,
    };
  }

  async upsertCallLog(input: CallLogUpsert): Promise<{ id: string } | null> {
    const row = check(
      await this.db
        .rpc('upsert_call_log', {
          p_call_sid: input.callSid,
          p_org_id: input.organizationId,
          p_from_number: input.fromNumber,
          p_to_number: input.toNumber,
          p_status: input.status ?? null,
          p_outcome: input.outcome ?? null,
          p_child_call_sid: input.childCallSid ?? null,
          p_duration_seconds: input.durationSeconds ?? null,
          p_ended_at: input.endedAt ?? null,
        })
        .maybeSingle(),
      'upsertCallLog'
    ) as { id: string | null } | null;
    // A cross-tenant call_sid conflict returns a NULL record rather than an error.
    return row?.id ? { id: row.id } : null;
  }

  async getUsageStatus(organizationId: string): Promise<UsageStatus> {
    const row = check(
      await this.db.rpc('org_usage_status', { p_org_id: organizationId }).maybeSingle(),
      'getUsageStatus'
    ) as { over_voice_limit: boolean; over_sms_limit: boolean } | null;
    return { overVoiceLimit: row?.over_voice_limit ?? false, overSmsLimit: row?.over_sms_limit ?? false };
  }

  async isOptedOut(organizationId: string, phoneNumber: string): Promise<boolean> {
    const row = check(
      await this.db
        .from('sms_opt_outs')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number', phoneNumber)
        .maybeSingle(),
      'isOptedOut'
    );
    return row !== null;
  }

  async getA2pRegistration(organizationId: string) {
    const row = check(
      await this.db
        .from('a2p_registrations')
        .select('status, messaging_service_sid')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      'getA2pRegistration'
    ) as { status: A2PStatus; messaging_service_sid: string | null } | null;
    return row ? { status: row.status, messagingServiceSid: row.messaging_service_sid } : null;
  }

  async claimSmsRescue(callSid: string, organizationId: string): Promise<boolean> {
    const claimed = check(
      await this.db.rpc('claim_sms_rescue', { p_call_sid: callSid, p_org_id: organizationId }),
      'claimSmsRescue'
    );
    return claimed === true;
  }

  async recordOutboundMessage(input: OutboundMessageRecord): Promise<void> {
    check(
      await this.db.from('messages').insert({
        organization_id: input.organizationId,
        call_log_id: input.callLogId,
        message_sid: input.messageSid,
        from_number: input.fromNumber,
        to_number: input.toNumber,
        body: input.body,
        direction: 'outbound_api',
        status: input.status,
        type: 'missed_call_auto_reply',
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
      }),
      'recordOutboundMessage'
    );
  }

  async incrementSmsUsage(organizationId: string): Promise<void> {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    check(
      await this.db.rpc('increment_usage', { p_org_id: organizationId, p_period_start: periodStart, p_sms_count: 1 }),
      'incrementSmsUsage'
    );
  }

  async beginWebhookEvent(provider: 'twilio', eventId: string, payload: Record<string, string>): Promise<'new' | 'duplicate'> {
    const inserted = check(
      await this.db
        .from('webhook_events')
        .upsert({ provider, event_id: eventId, payload }, { onConflict: 'provider,event_id', ignoreDuplicates: true })
        .select('id'),
      'beginWebhookEvent'
    ) as { id: string }[] | null;
    if (inserted && inserted.length > 0) return 'new';

    const existing = check(
      await this.db
        .from('webhook_events')
        .select('processed_at')
        .eq('provider', provider)
        .eq('event_id', eventId)
        .maybeSingle(),
      'beginWebhookEvent lookup'
    ) as { processed_at: string | null } | null;
    // An event recorded but never completed (crash mid-write) is safe to reprocess:
    // upsert_call_log is idempotent.
    return existing?.processed_at ? 'duplicate' : 'new';
  }

  async completeWebhookEvent(provider: 'twilio', eventId: string): Promise<void> {
    check(
      await this.db
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('provider', provider)
        .eq('event_id', eventId),
      'completeWebhookEvent'
    );
  }

  async recordInboundMessage(input: InboundMessageRecord): Promise<'new' | 'duplicate'> {
    const inserted = check(
      await this.db
        .from('messages')
        .upsert(
          {
            organization_id: input.organizationId,
            message_sid: input.messageSid,
            from_number: input.fromNumber,
            to_number: input.toNumber,
            body: input.body,
            direction: 'inbound',
            status: 'received',
            type: 'manual_chat',
          },
          { onConflict: 'message_sid', ignoreDuplicates: true }
        )
        .select('id'),
      'recordInboundMessage'
    ) as { id: string }[] | null;
    return inserted && inserted.length > 0 ? 'new' : 'duplicate';
  }

  async recordOptOut(organizationId: string, phoneNumber: string, source: OptOutSource): Promise<void> {
    check(
      await this.db
        .from('sms_opt_outs')
        .upsert(
          { organization_id: organizationId, phone_number: phoneNumber, source },
          { onConflict: 'organization_id,phone_number', ignoreDuplicates: true }
        ),
      'recordOptOut'
    );
  }

  async clearOptOut(organizationId: string, phoneNumber: string): Promise<void> {
    check(
      await this.db.from('sms_opt_outs').delete().eq('organization_id', organizationId).eq('phone_number', phoneNumber),
      'clearOptOut'
    );
  }

  async updateMessageStatus(messageSid: string, status: MessageStatus, error?: { code?: string; message?: string }) {
    // Receipts arrive out of order (sent after delivered); never move a terminal status back.
    check(
      await this.db
        .from('messages')
        .update({ status, error_code: error?.code ?? null, error_message: error?.message ?? null })
        .eq('message_sid', messageSid)
        .not('status', 'in', `(${TERMINAL_MESSAGE_STATUSES.join(',')})`),
      'updateMessageStatus'
    );
    const row = check(
      await this.db.from('messages').select('organization_id, to_number').eq('message_sid', messageSid).maybeSingle(),
      'updateMessageStatus lookup'
    ) as { organization_id: string; to_number: string } | null;
    return row ? { organizationId: row.organization_id, toNumber: row.to_number } : null;
  }
}
