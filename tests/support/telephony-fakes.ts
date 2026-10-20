// Shared in-memory fakes for telephony unit tests (handlers, rescue SMS, replay drain).
import { MockSmsProvider } from '../../src/lib/providers/sms/mock';
import { MockTelephonyProvider } from '../../src/lib/providers/telephony/mock';
import type { BusinessHours } from '../../src/lib/telephony/business-hours';
import { LineConfigCache } from '../../src/lib/telephony/line-cache';
import type { MessageStatus, OptOutSource } from '../../src/types/database.types';
import type {
  CallLogUpsert,
  CallRepository,
  InboundMessageRecord,
  LineConfig,
  OutboundMessageRecord,
  TelephonyDeps,
  UsageStatus,
} from '../../src/lib/telephony/types';

export const WEEKDAY_HOURS: BusinessHours = {
  monday: { open: '09:00', close: '17:00' },
  tuesday: { open: '09:00', close: '17:00' },
  wednesday: { open: '09:00', close: '17:00' },
  thursday: { open: '09:00', close: '17:00' },
  friday: { open: '22:00', close: '02:00' },
  saturday: { open: '00:00', close: '00:00', closed: true },
  sunday: { open: '00:00', close: '00:00', closed: true },
};

// 2026-10-20 is a Tuesday. America/Chicago is UTC-5 in October.
export const TUESDAY_10AM_CHICAGO = new Date('2026-10-20T15:00:00Z');
export const TUESDAY_8PM_CHICAGO = new Date('2026-10-21T01:00:00Z');

export const LINE: LineConfig = {
  configId: 'cfg-1',
  organizationId: 'org-acme',
  twilioPhoneNumber: '+12025550101',
  forwardToNumber: '+12025550199',
  forwardTimeoutSeconds: 15,
  abandonThresholdSeconds: 8,
  missedCallSmsEnabled: true,
  missedCallSmsTemplate: 'Hi, this is {{business_name}}! We missed your call. How can we help you today?',
  aiVoiceEnabled: true,
  afterHoursDirectToAi: true,
  businessName: 'Acme Plumbing & Drain',
  timezone: 'America/Chicago',
  businessHours: WEEKDAY_HOURS,
  vapiAssistantId: 'ast-acme',
  subscriptionStatus: 'active',
};

export class InMemoryRepo implements CallRepository {
  lines = new Map<string, LineConfig>([[LINE.twilioPhoneNumber, LINE]]);
  callLogs = new Map<string, CallLogUpsert & { smsRescued: boolean }>();
  messages: OutboundMessageRecord[] = [];
  inbound: InboundMessageRecord[] = [];
  optOuts = new Set<string>();
  optOutSources = new Map<string, OptOutSource>();
  a2p: { status: 'approved' | 'pending'; messagingServiceSid: string | null } | null = {
    status: 'approved',
    messagingServiceSid: 'MG123',
  };
  usage: UsageStatus = { overVoiceLimit: false, overSmsLimit: false };
  smsUsage = 0;
  events = new Map<string, boolean>();
  failLookups = false;
  failWrites = false;
  upsertCalls = 0;

  async findLineByNumber(n: string) {
    if (this.failLookups) throw new Error('db down');
    return this.lines.get(n) ?? null;
  }
  async upsertCallLog(input: CallLogUpsert) {
    if (this.failWrites) throw new Error('db down');
    this.upsertCalls++;
    const prev = this.callLogs.get(input.callSid);
    const merged = { smsRescued: false, ...prev, ...stripUndefined(input) } as CallLogUpsert & { smsRescued: boolean };
    this.callLogs.set(input.callSid, merged);
    return { id: `log-${input.callSid}` };
  }
  async getUsageStatus() {
    return this.usage;
  }
  async isOptedOut(org: string, phone: string) {
    return this.optOuts.has(`${org}:${phone}`);
  }
  async getA2pRegistration() {
    return this.a2p;
  }
  async claimSmsRescue(callSid: string) {
    const log = this.callLogs.get(callSid);
    if (!log || log.smsRescued) return false;
    log.smsRescued = true;
    return true;
  }
  async recordOutboundMessage(input: OutboundMessageRecord) {
    this.messages.push(input);
  }
  async incrementSmsUsage() {
    this.smsUsage++;
  }
  async beginWebhookEvent(_p: 'twilio', id: string) {
    if (this.failWrites) throw new Error('db down');
    if (this.events.get(id)) return 'duplicate' as const;
    this.events.set(id, false);
    return 'new' as const;
  }
  async completeWebhookEvent(_p: 'twilio', id: string) {
    this.events.set(id, true);
  }
  async recordInboundMessage(input: InboundMessageRecord) {
    if (this.failWrites) throw new Error('db down');
    if (this.inbound.some((m) => m.messageSid === input.messageSid)) return 'duplicate' as const;
    this.inbound.push(input);
    return 'new' as const;
  }
  async recordOptOut(org: string, phone: string, source: OptOutSource) {
    if (this.failWrites) throw new Error('db down');
    const key = `${org}:${phone}`;
    if (!this.optOuts.has(key)) this.optOutSources.set(key, source);
    this.optOuts.add(key);
  }
  async clearOptOut(org: string, phone: string) {
    if (this.failWrites) throw new Error('db down');
    this.optOuts.delete(`${org}:${phone}`);
  }
  async updateMessageStatus(messageSid: string, status: MessageStatus, error?: { code?: string; message?: string }) {
    if (this.failWrites) throw new Error('db down');
    const message = this.messages.find((m) => m.messageSid === messageSid);
    if (!message) return null;
    if (!['delivered', 'undelivered', 'failed', 'received'].includes(message.status)) {
      message.status = status;
      message.errorCode = error?.code;
      message.errorMessage = error?.message;
    }
    return { organizationId: message.organizationId, toNumber: message.toNumber };
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function makeDeps(overrides: Partial<TelephonyDeps> = {}) {
  const repo = new InMemoryRepo();
  const sms = new MockSmsProvider();
  const buffered: Array<{ kind: string; payload: Record<string, string> }> = [];
  const logs: string[] = [];
  const deps: TelephonyDeps = {
    repo,
    lines: new LineConfigCache(repo),
    telephony: new MockTelephonyProvider(),
    sms,
    replayBuffer: { enqueue: async (kind, payload) => void buffered.push({ kind, payload }) },
    logger: { warn: (m) => void logs.push(m), error: (m) => void logs.push(m) },
    now: () => TUESDAY_10AM_CHICAGO,
    killSwitch: false,
    requireA2pApproval: true,
    actionUrl: (leg) => `https://app.test/api/incoming-call/action?leg=${leg}`,
    smsStatusUrl: 'https://app.test/api/sms/status',
    smsKeywordReplies: 'twilio',
    vapi: { sipEndpoint: 'sip.vapi.ai' },
    ...overrides,
  };
  return { deps, repo, sms, buffered, logs };
}

export const CALL = { CallSid: 'CA100', From: '+13125550100', To: '+12025550101' };

export async function runAll(res: { background?: () => Promise<void> }) {
  if (res.background) await res.background();
}

