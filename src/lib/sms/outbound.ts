import { E164 } from '../telephony/rescue-sms';
import type { TelephonyDeps } from '../telephony/types';

export const MAX_REPLY_LENGTH = 640; // four SMS segments

export type ManualReplyResult =
  | { ok: true; messageSid: string }
  | {
      ok: false;
      error: 'empty' | 'too_long' | 'invalid_recipient' | 'no_prior_contact' | 'opted_out' | 'a2p_not_approved' | 'over_quota' | 'disabled' | 'send_failed';
    };

// A staff member replying from the dashboard inbox. Same compliance gates as the rescue text,
// plus: only people who called or texted this business first (no cold outreach from the inbox).
export async function sendManualReply(
  input: { organizationId: string; fromNumber: string; to: string; body: string },
  deps: Pick<TelephonyDeps, 'repo' | 'sms' | 'killSwitch' | 'requireA2pApproval' | 'smsStatusUrl' | 'logger'>
): Promise<ManualReplyResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'empty' };
  if (body.length > MAX_REPLY_LENGTH) return { ok: false, error: 'too_long' };
  if (!E164.test(input.to)) return { ok: false, error: 'invalid_recipient' };
  if (deps.killSwitch) return { ok: false, error: 'disabled' };

  const { repo } = deps;
  if (!(await repo.hasPriorContact(input.organizationId, input.to))) return { ok: false, error: 'no_prior_contact' };
  if (await repo.isOptedOut(input.organizationId, input.to)) return { ok: false, error: 'opted_out' };

  const a2p = await repo.getA2pRegistration(input.organizationId);
  if (deps.requireA2pApproval && a2p?.status !== 'approved') return { ok: false, error: 'a2p_not_approved' };
  if ((await repo.getUsageStatus(input.organizationId)).overSmsLimit) return { ok: false, error: 'over_quota' };

  const result = await deps.sms.sendSms({
    to: input.to,
    from: input.fromNumber,
    body,
    messagingServiceSid: a2p?.messagingServiceSid ?? undefined,
    statusCallback: deps.smsStatusUrl,
  });

  await repo.recordOutboundMessage({
    organizationId: input.organizationId,
    callLogId: null,
    messageSid: result.messageSid || null,
    fromNumber: input.fromNumber,
    toNumber: input.to,
    body,
    status: result.status === 'failed' ? 'failed' : 'queued',
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    type: 'manual_chat',
  });

  if (result.status === 'failed') {
    deps.logger.error('Manual reply send failed', { organizationId: input.organizationId, errorCode: result.errorCode });
    return { ok: false, error: 'send_failed' };
  }
  await repo.incrementSmsUsage(input.organizationId);
  return { ok: true, messageSid: result.messageSid };
}
