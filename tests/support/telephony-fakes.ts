// Shared in-memory fakes for telephony unit tests (handlers, rescue SMS, replay drain).
import { MockSmsProvider } from '../../src/lib/providers/sms/mock';
import { MockTelephonyProvider } from '../../src/lib/providers/telephony/mock';
import type { BusinessHours } from '../../src/lib/telephony/business-hours';
import { LineConfigCache } from '../../src/lib/telephony/line-cache';
import type { MessageStatus, OptOutSource } from '../../src/types/database.types';
import type {
  AiCallReportRecord,
  CallLogUpsert,
  CallRef,
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
  vapiPhoneNumberId: 'vapi-pn-acme',
  subscriptionStatus: 'active',
};

type FakeCallLog = CallLogUpsert & { smsRescued: boolean; createdAt?: string; vapiCallId?: string } & Partial<Omit<AiCallReportRecord, 'callSid' | 'organizationId' | 'vapiCallId' | 'outcome' | 'durationSeconds'>>;

export class InMemoryRepo implements CallRepository {
  lines = new Map<string, LineConfig>([[LINE.twilioPhoneNumber, LINE]]);
  callLogs = new Map<string, FakeCallLog>();
  vapiPhoneNumbers = new Map<string, string>([['vapi-pn-acme', LINE.organizationId]]);
  voiceSeconds = 0;
  // Same clock as the handlers under test (makeDeps wires it), so time-window queries line up.
  now: () => Date = () => new Date();
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
    const merged = { smsRescued: false, createdAt: this.now().toISOString(), ...prev, ...stripUndefined(input) } as FakeCallLog;
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
  // Optional in CallRepository; tests that care assign a spy.
  recordRescueResult?: (callSid: string, organizationId: string, result: string) => Promise<void>;
  async incrementSmsUsage() {
    this.smsUsage++;
  }
  async beginWebhookEvent(_p: 'twilio' | 'vapi', id: string) {
    if (this.failWrites) throw new Error('db down');
    if (this.events.get(id)) return 'duplicate' as const;
    this.events.set(id, false);
    return 'new' as const;
  }
  async completeWebhookEvent(_p: 'twilio' | 'vapi', id: string) {
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
  private ref(callSid: string, c: FakeCallLog): CallRef {
    return { callSid, organizationId: c.organizationId, fromNumber: c.fromNumber, toNumber: c.toNumber, vapiCallId: c.vapiCallId ?? null };
  }
  async findCallBySid(callSid: string) {
    if (this.failLookups) throw new Error('db down');
    const c = this.callLogs.get(callSid);
    return c ? this.ref(callSid, c) : null;
  }
  async findOrganizationByVapiPhoneNumber(id: string) {
    return this.vapiPhoneNumbers.get(id) ?? null;
  }
  async findRecentAiHandoffs(caller: string, since: string, org?: string) {
    return [...this.callLogs.entries()]
      .filter(([, c]) => c.fromNumber === caller && c.outcome === 'forwarded_to_ai' && !c.vapiCallId && (c.createdAt ?? '') >= since)
      .filter(([, c]) => !org || c.organizationId === org)
      .sort(([, a], [, b]) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 2)
      .map(([sid, c]) => this.ref(sid, c));
  }
  async applyAiCallReport(input: AiCallReportRecord) {
    if (this.failWrites) throw new Error('db down');
    const c = this.callLogs.get(input.callSid);
    if (!c || c.organizationId !== input.organizationId) return false;
    if (c.vapiCallId && c.vapiCallId !== input.vapiCallId) return false;
    c.vapiCallId = input.vapiCallId;
    if (input.outcome) c.outcome = input.outcome;
    c.endedReason = input.endedReason;
    c.durationSeconds = Math.max(c.durationSeconds ?? 0, input.durationSeconds);
    c.transcript = input.transcript;
    c.summary = input.summary;
    c.recordingUrl = input.recordingUrl;
    return true;
  }
  async incrementVoiceUsage(_org: string, seconds: number) {
    this.voiceSeconds += seconds;
  }
  async hasPriorContact(org: string, phone: string) {
    return (
      [...this.callLogs.values()].some((c) => c.organizationId === org && c.fromNumber === phone) ||
      this.inbound.some((m) => m.organizationId === org && m.fromNumber === phone)
    );
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
    vapi: { sipEndpoint: 'sip.vapi.ai', webhookSecret: 'vapi-test-secret' },
    ...overrides,
  };
  repo.now = deps.now;
  return { deps, repo, sms, buffered, logs };
}

export const CALL = { CallSid: 'CA100', From: '+13125550100', To: '+12025550101' };

export async function runAll(res: { background?: () => Promise<void> }) {
  if (res.background) await res.background();
}

