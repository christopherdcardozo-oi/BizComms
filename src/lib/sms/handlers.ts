import type { MessageStatus } from '../../types/database.types';
import { E164 } from '../telephony/rescue-sms';
import type { LineConfig, TelephonyDeps, WebhookResponse } from '../telephony/types';
import { buildMessagingTwiML } from '../twilio/messaging-twiml';
import {
  classifyInboundSms,
  helpMessage,
  optInConfirmation,
  optOutConfirmation,
  type IntentSource,
  type SmsIntent,
} from './keywords';

type Params = Record<string, string>;

// Error 21610 means Twilio itself holds this recipient as opted out (they texted STOP to the
// number, possibly before we were recording it), so mirror that into our registry.
const TWILIO_OPTED_OUT_ERROR = '21610';

const MESSAGE_STATUS_MAP: Record<string, MessageStatus> = {
  accepted: 'queued',
  scheduled: 'queued',
  queued: 'queued',
  sending: 'sending',
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',
  undelivered: 'undelivered',
  failed: 'failed',
  canceled: 'failed',
};

export type InboundSmsResult =
  | { status: 'ignored' }
  | { status: 'applied' | 'duplicate'; line: LineConfig; intent: SmsIntent; source: IntentSource };

// The database half of an inbound SMS: opt-out state first (the compliance-critical write), then
// the message row. Safe to run more than once for the same MessageSid, which is what the replay
// drain does. Throws on database failure.
export async function applyInboundSms(params: Params, deps: TelephonyDeps): Promise<InboundSmsResult> {
  const { MessageSid: messageSid, From: from, To: to, Body: body = '', OptOutType: optOutType } = params;
  if (!E164.test(from ?? '')) return { status: 'ignored' };

  const { config: line } = await deps.lines.resolve(to);
  if (!line) return { status: 'ignored' };

  const { intent, source } = classifyInboundSms(body, optOutType);
  if (intent === 'opt_out') await deps.repo.recordOptOut(line.organizationId, from, 'inbound_stop');
  if (intent === 'opt_in') await deps.repo.clearOptOut(line.organizationId, from);

  const stored = await deps.repo.recordInboundMessage({
    organizationId: line.organizationId,
    messageSid,
    fromNumber: from,
    toNumber: line.twilioPhoneNumber,
    body,
  });
  return { status: stored === 'new' ? 'applied' : 'duplicate', line, intent, source };
}

function replyFor(result: InboundSmsResult, deps: TelephonyDeps): string | undefined {
  if (result.status !== 'applied' || deps.killSwitch) return undefined;
  const { line, intent, source } = result;

  // Twilio already answered keywords it matched (carrier) and, in 'twilio' mode, exact keywords.
  // Plain-language revocations are never seen by Twilio, so the app always confirms those.
  const appAnswers = source === 'phrase' || (source === 'keyword' && deps.smsKeywordReplies === 'app');
  if (!appAnswers) return undefined;

  switch (intent) {
    case 'opt_out':
      return optOutConfirmation(line.businessName);
    case 'opt_in':
      return optInConfirmation(line.businessName);
    case 'help':
      return helpMessage(line.businessName, line.twilioPhoneNumber);
    default:
      return undefined;
  }
}

// POST /api/sms/webhook — Twilio inbound message webhook for every tenant number.
// Ordinary customer texts are stored for the dashboard inbox (Module E); no auto-reply is sent.
export async function handleInboundSms(params: Params, deps: TelephonyDeps): Promise<WebhookResponse> {
  if (!params.MessageSid || !params.To) return { status: 400 };

  let result: InboundSmsResult;
  try {
    result = await applyInboundSms(params, deps);
  } catch (err) {
    deps.logger.error('Inbound SMS write failed', { messageSid: params.MessageSid, error: String(err) });
    if (!deps.replayBuffer) return { status: 500 };
    try {
      // An opt-out must never be lost: buffer it and replay once the database is back.
      await deps.replayBuffer.enqueue('twilio-inbound-sms', params);
      return { status: 200, twiml: buildMessagingTwiML() };
    } catch (bufferErr) {
      deps.logger.error('Replay buffer enqueue failed', { messageSid: params.MessageSid, error: String(bufferErr) });
      return { status: 500 };
    }
  }

  return { status: 200, twiml: buildMessagingTwiML(replyFor(result, deps)) };
}

// POST /api/sms/status — delivery receipts for messages we sent (statusCallback on sendSms).
export async function handleSmsStatus(params: Params, deps: TelephonyDeps): Promise<WebhookResponse> {
  const { MessageSid: messageSid, MessageStatus: rawStatus, ErrorCode: errorCode, ErrorMessage: errorMessage } = params;
  if (!messageSid || !rawStatus) return { status: 400 };
  const status = MESSAGE_STATUS_MAP[rawStatus];
  if (!status) return { status: 204 };

  try {
    const message = await deps.repo.updateMessageStatus(
      messageSid,
      status,
      errorCode ? { code: errorCode, message: errorMessage } : undefined
    );
    if (message && errorCode === TWILIO_OPTED_OUT_ERROR) {
      await deps.repo.recordOptOut(message.organizationId, message.toNumber, 'api');
    }
    return { status: 204 };
  } catch (err) {
    deps.logger.error('SMS status write failed', { messageSid, error: String(err) });
    if (!deps.replayBuffer) return { status: 500 };
    try {
      await deps.replayBuffer.enqueue('twilio-sms-status', params);
      return { status: 202 };
    } catch (bufferErr) {
      deps.logger.error('Replay buffer enqueue failed', { messageSid, error: String(bufferErr) });
      return { status: 500 };
    }
  }
}
