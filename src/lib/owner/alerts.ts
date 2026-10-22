// Lead alerts texted to the owner's own phone. Plain ASCII on purpose: an emoji switches the whole
// text to UCS-2, which cuts a segment from 160 to 70 characters and multiplies the cost.
import { billingAllowsService } from '../billing/status';
import { formatNanp } from '../numbers/phone';
import type { LineConfig, TelephonyDeps } from '../telephony/types';
import type { AlertClaim } from './types';

export const OWNER_ALERT_MAX = 320; // two segments
const REPLY_HINT = 'Reply 1 to call them, 2 to text that you will call shortly, ? for more.';

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 3).trimEnd()}...`;
}

// Fits the alert in two segments by trimming the middle (the quoted text or summary), never the
// reply hint, which is what makes the alert actionable.
function compose(head: string, middle: string, tail: string): string {
  const room = OWNER_ALERT_MAX - head.length - tail.length - 2;
  return [head, middle ? clip(middle, Math.max(room, 0)) : '', tail].filter(Boolean).join(' ');
}

export function missedCallAlert(caller: string, textedBack: boolean): string {
  return compose(`Missed call from ${formatNanp(caller)}.`, textedBack ? 'We texted them back.' : '', REPLY_HINT);
}

export function aiCallAlert(caller: string, summary: string | null, urgent: boolean): string {
  const head = `${urgent ? 'URGENT: ' : ''}AI receptionist took a call from ${formatNanp(caller)}.`;
  return compose(head, summary ?? 'No summary.', 'Reply 1 to call them back, ? for more.');
}

export function inboundTextAlert(from: string, body: string): string {
  return compose(`New text from ${formatNanp(from)}:`, `"${body.trim()}"`, REPLY_HINT);
}

// The AI summary is told to start with "URGENT:" for urgent calls (receptionist.ts summary prompt).
export function isUrgentSummary(summary: string | null | undefined): boolean {
  return /^\s*urgent\b/i.test(summary ?? '');
}

type AlertDeps = Pick<TelephonyDeps, 'repo' | 'sms' | 'killSwitch' | 'requireA2pApproval' | 'smsStatusUrl' | 'logger' | 'owner'>;

export type OwnerAlertResult = 'sent' | 'duplicate' | 'disabled' | 'billing_inactive' | 'opted_out' | 'a2p_not_approved' | 'over_quota' | 'failed';

// Same compliance gates as every other text (kill switch, billing, opt-out, A2P, quota), plus the
// owner's on/off switch. Claims the alert first so a redelivered callback never texts twice.
// Never throws: an alert failing must not affect the call or text it is about.
export async function sendOwnerAlert(line: LineConfig, claim: Omit<AlertClaim, 'organizationId'>, body: string, deps: AlertDeps): Promise<OwnerAlertResult> {
  const owner = deps.owner;
  if (!owner || deps.killSwitch || line.ownerAlertsEnabled === false) return 'disabled';
  if (!billingAllowsService(line.subscriptionStatus)) return 'billing_inactive';
  const to = line.forwardToNumber;
  try {
    if (await deps.repo.isOptedOut(line.organizationId, to)) return 'opted_out';
    const a2p = await deps.repo.getA2pRegistration(line.organizationId);
    if (deps.requireA2pApproval && a2p?.status !== 'approved') return 'a2p_not_approved';
    if ((await deps.repo.getUsageStatus(line.organizationId)).overSmsLimit) return 'over_quota';
    if (!(await owner.store.claimAlert({ ...claim, organizationId: line.organizationId }))) return 'duplicate';

    const result = await deps.sms.sendSms({
      to,
      from: line.twilioPhoneNumber,
      body,
      messagingServiceSid: a2p?.messagingServiceSid ?? undefined,
      statusCallback: deps.smsStatusUrl,
    });
    await deps.repo.recordOutboundMessage({
      organizationId: line.organizationId,
      callLogId: null,
      messageSid: result.messageSid || null,
      fromNumber: line.twilioPhoneNumber,
      toNumber: to,
      body,
      status: result.status === 'failed' ? 'failed' : 'queued',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      type: 'system_alert',
    });
    if (result.status === 'failed') return 'failed';
    await deps.repo.incrementSmsUsage(line.organizationId);
    return 'sent';
  } catch (err) {
    deps.logger.error('Owner alert failed', { organizationId: line.organizationId, kind: claim.kind, error: String(err) });
    return 'failed';
  }
}

export function notifyMissedCall(line: LineConfig, callSid: string, caller: string, textedBack: boolean, deps: AlertDeps) {
  return sendOwnerAlert(
    line,
    { kind: 'missed_call', dedupeKey: `call:${callSid}`, contactNumber: caller, callSid, urgent: false },
    missedCallAlert(caller, textedBack),
    deps
  );
}

export function notifyAiCall(line: LineConfig, callSid: string, caller: string, summary: string | null, deps: AlertDeps) {
  const urgent = isUrgentSummary(summary);
  return sendOwnerAlert(
    line,
    { kind: 'ai_call', dedupeKey: `ai:${callSid}`, contactNumber: caller, callSid, urgent },
    aiCallAlert(caller, summary, urgent),
    deps
  );
}

// At most one alert per customer per 15 minutes, so a back-and-forth doesn't flood the owner.
export function notifyInboundText(line: LineConfig, from: string, body: string, now: Date, deps: AlertDeps) {
  const bucket = Math.floor(now.getTime() / (15 * 60_000));
  return sendOwnerAlert(
    line,
    { kind: 'text', dedupeKey: `text:${from}:${bucket}`, contactNumber: from, callSid: null, urgent: false },
    inboundTextAlert(from, body),
    deps
  );
}
