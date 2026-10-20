import type { A2PStatus, CallOutcome, CallStatus, MessageStatus, OptOutSource } from '../../types/database.types';
import type { ISmsProvider } from '../providers/sms/types';
import type { ITelephonyProvider } from '../providers/telephony/types';
import type { BusinessHours } from './business-hours';
import type { LineConfigCache } from './line-cache';

// Everything a webhook needs to route a call for one Twilio number, joined from
// twilio_configs + organizations in a single indexed lookup.
export interface LineConfig {
  configId: string;
  organizationId: string;
  twilioPhoneNumber: string;
  forwardToNumber: string;
  forwardTimeoutSeconds: number;
  abandonThresholdSeconds: number;
  missedCallSmsEnabled: boolean;
  missedCallSmsTemplate: string;
  aiVoiceEnabled: boolean;
  afterHoursDirectToAi: boolean;
  businessName: string;
  timezone: string;
  businessHours: BusinessHours | null;
  vapiAssistantId: string | null;
  subscriptionStatus: string | null;
}

export interface UsageStatus {
  overVoiceLimit: boolean;
  overSmsLimit: boolean;
}

export interface CallLogUpsert {
  callSid: string;
  organizationId: string;
  fromNumber: string;
  toNumber: string;
  status?: CallStatus;
  outcome?: CallOutcome;
  childCallSid?: string;
  durationSeconds?: number;
  endedAt?: string;
}

export interface OutboundMessageRecord {
  organizationId: string;
  callLogId: string | null;
  messageSid: string | null;
  fromNumber: string;
  toNumber: string;
  body: string;
  status: MessageStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface InboundMessageRecord {
  organizationId: string;
  messageSid: string;
  fromNumber: string;
  toNumber: string;
  body: string;
}

export interface CallRepository {
  findLineByNumber(twilioPhoneNumber: string): Promise<LineConfig | null>;
  upsertCallLog(input: CallLogUpsert): Promise<{ id: string } | null>;
  getUsageStatus(organizationId: string): Promise<UsageStatus>;
  isOptedOut(organizationId: string, phoneNumber: string): Promise<boolean>;
  getA2pRegistration(
    organizationId: string
  ): Promise<{ status: A2PStatus; messagingServiceSid: string | null } | null>;
  claimSmsRescue(callSid: string, organizationId: string): Promise<boolean>;
  recordOutboundMessage(input: OutboundMessageRecord): Promise<void>;
  incrementSmsUsage(organizationId: string): Promise<void>;
  // Returns 'duplicate' only when the event was already fully processed.
  beginWebhookEvent(provider: 'twilio', eventId: string, payload: Record<string, string>): Promise<'new' | 'duplicate'>;
  completeWebhookEvent(provider: 'twilio', eventId: string): Promise<void>;
  // Inbound SMS (Module C). 'duplicate' when this MessageSid was already stored.
  recordInboundMessage(input: InboundMessageRecord): Promise<'new' | 'duplicate'>;
  recordOptOut(organizationId: string, phoneNumber: string, source: OptOutSource): Promise<void>;
  clearOptOut(organizationId: string, phoneNumber: string): Promise<void>;
  // Applies a delivery receipt without regressing a terminal status; returns the message's
  // owning org and recipient, or null when the MessageSid is unknown.
  updateMessageStatus(
    messageSid: string,
    status: MessageStatus,
    error?: { code?: string; message?: string }
  ): Promise<{ organizationId: string; toNumber: string } | null>;
}

// Durable side-buffer for callbacks that arrive while the database is unreachable (DESIGN_NOTES §6).
export interface ReplayBuffer {
  enqueue(kind: string, payload: Record<string, string>): Promise<void>;
}

export interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface TelephonyDeps {
  repo: CallRepository;
  lines: LineConfigCache;
  telephony: ITelephonyProvider;
  sms: ISmsProvider;
  replayBuffer: ReplayBuffer | null;
  logger: Logger;
  now: () => Date;
  killSwitch: boolean;
  // Mock SMS in local dev can run without an approved A2P campaign.
  requireA2pApproval: boolean;
  actionUrl: (leg: DialLeg) => string;
  smsStatusUrl: string;
  // Who answers STOP/START/HELP: Twilio's built-in (Advanced) Opt-Out, or this app.
  smsKeywordReplies: 'twilio' | 'app';
  vapi: { sipEndpoint: string; defaultAssistantId?: string };
}

export type DialLeg = 'forward' | 'ai';

export interface WebhookResponse {
  status: number;
  twiml?: string;
  // Deferred work run after the response is sent (Next.js `after()`), never on the caller's clock.
  background?: () => Promise<void>;
}
