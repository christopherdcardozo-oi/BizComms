import type { CallOutcome } from '../../types/database.types';
import { billingAllowsService } from '../billing/status';
import type { LineConfig, TelephonyDeps } from './types';

export const E164 = /^\+[1-9]\d{6,14}$/;

const OPT_OUT_NOTICE = 'Reply STOP to opt out.';

export function renderRescueSms(template: string, businessName: string): string {
  const body = template.replace(/\{\{\s*business_name\s*\}\}/g, businessName).trim();
  // CTIA requires opt-out language in the first message to a recipient.
  return /\bSTOP\b/i.test(body) ? body : `${body} ${OPT_OUT_NOTICE}`;
}

export type RescueResult =
  | 'sent'
  | 'failed'
  | 'disabled'
  | 'billing_inactive'
  | 'invalid_caller'
  | 'opted_out'
  | 'a2p_not_approved'
  | 'over_quota'
  | 'already_rescued';

// Missed-call text-back (Case A in DESIGN_NOTES §1; reused by the Vapi webhook for Case B).
// Records the call outcome first so a row exists to claim, then runs every compliance gate,
// then claims sms_rescued atomically so at most one text is ever sent per call.
export async function rescueMissedCall(
  input: {
    line: LineConfig;
    callSid: string;
    callerNumber: string;
    outcome?: CallOutcome;
    // Recorded only once the text actually went out (e.g. 'missed_call_texted').
    outcomeIfSent?: CallOutcome;
  },
  deps: TelephonyDeps
): Promise<RescueResult> {
  const { line, callSid, callerNumber, outcome, outcomeIfSent } = input;
  const { repo, logger } = deps;

  if (!E164.test(callerNumber)) return 'invalid_caller';

  const callLog = await repo.upsertCallLog({
    callSid,
    organizationId: line.organizationId,
    fromNumber: callerNumber,
    toNumber: line.twilioPhoneNumber,
    outcome,
  });

  if (deps.killSwitch || !line.missedCallSmsEnabled) return 'disabled';
  if (!billingAllowsService(line.subscriptionStatus)) return 'billing_inactive';
  if (await repo.isOptedOut(line.organizationId, callerNumber)) return 'opted_out';

  const a2p = await repo.getA2pRegistration(line.organizationId);
  if (deps.requireA2pApproval && a2p?.status !== 'approved') {
    logger.warn('Rescue SMS blocked: A2P 10DLC campaign not approved', { organizationId: line.organizationId, callSid });
    return 'a2p_not_approved';
  }

  try {
    const usage = await repo.getUsageStatus(line.organizationId);
    if (usage.overSmsLimit) return 'over_quota';
  } catch (err) {
    // Fail open: one text over quota is cheaper than silently dropping a lead.
    logger.warn('SMS quota check failed; sending anyway', { organizationId: line.organizationId, error: String(err) });
  }

  if (!(await repo.claimSmsRescue(callSid, line.organizationId))) return 'already_rescued';

  const body = renderRescueSms(line.missedCallSmsTemplate, line.businessName);
  const result = await deps.sms.sendSms({
    to: callerNumber,
    from: line.twilioPhoneNumber,
    body,
    messagingServiceSid: a2p?.messagingServiceSid ?? undefined,
    statusCallback: deps.smsStatusUrl,
  });

  await repo.recordOutboundMessage({
    organizationId: line.organizationId,
    callLogId: callLog?.id ?? null,
    messageSid: result.messageSid || null,
    fromNumber: line.twilioPhoneNumber,
    toNumber: callerNumber,
    body,
    status: result.status === 'failed' ? 'failed' : 'queued',
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  });

  if (result.status === 'failed') {
    logger.error('Rescue SMS send failed', { callSid, errorCode: result.errorCode, errorMessage: result.errorMessage });
    return 'failed';
  }

  await repo.incrementSmsUsage(line.organizationId);
  if (outcomeIfSent) {
    await repo.upsertCallLog({
      callSid,
      organizationId: line.organizationId,
      fromNumber: callerNumber,
      toNumber: line.twilioPhoneNumber,
      outcome: outcomeIfSent,
    });
  }
  return 'sent';
}
