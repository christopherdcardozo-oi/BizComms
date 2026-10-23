import type { CallOutcome, CallStatus } from '../../types/database.types';
import { planFeatures } from '../billing/plans';
import { billingAllowsService } from '../billing/status';
import { CALL_SID_HEADER, ORG_ID_HEADER, vapiSipUri } from '../voice/sip';
import { isWithinBusinessHours } from './business-hours';
import { notifyMissedCall } from '../owner/alerts';
import { E164, recordRescueOutcome, rescueMissedCall } from './rescue-sms';
import type { DialLeg, LineConfig, TelephonyDeps, WebhookResponse } from './types';

const TERMINAL_STATUSES: ReadonlySet<CallStatus> = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
const CALL_STATUSES: ReadonlySet<string> = new Set([
  'queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled',
]);

const UNAVAILABLE_MESSAGE = "Sorry, we can't take your call right now. We'll follow up with you shortly.";

type Params = Record<string, string>;

// The org's AI receptionist SIP address, or null when the AI must not take this call.
function aiSipUriFor(line: LineConfig, deps: TelephonyDeps): string | null {
  if (deps.killSwitch || !line.aiVoiceEnabled || !line.vapiPhoneNumberId) return null;
  if (!billingAllowsService(line.subscriptionStatus)) return null;
  // Not in the plan: the owner's phone still rings and missed callers still get the text-back.
  if (!planFeatures(line.stripePriceId).aiReceptionist) return null;
  return vapiSipUri(line.organizationId, deps.vapi.sipEndpoint);
}

async function hasVoiceQuota(line: LineConfig, deps: TelephonyDeps): Promise<boolean> {
  try {
    return !(await deps.repo.getUsageStatus(line.organizationId)).overVoiceLimit;
  } catch (err) {
    // Fail open: a caller reaching the AI matters more than a few over-quota minutes.
    deps.logger.warn('Voice quota check failed; allowing AI handoff', { organizationId: line.organizationId, error: String(err) });
    return true;
  }
}

function sipHandoff(sipUri: string, line: LineConfig, callSid: string, deps: TelephonyDeps): string {
  return deps.telephony.buildSipHandoffTwiML({
    sipEndpoint: sipUri,
    sipHeaders: { [ORG_ID_HEADER]: line.organizationId, [CALL_SID_HEADER]: callSid },
    actionUrl: deps.actionUrl('ai'),
  });
}

function safely(deps: TelephonyDeps, label: string, work: () => Promise<unknown>): () => Promise<void> {
  return async () => {
    try {
      await work();
    } catch (err) {
      deps.logger.error(`${label} failed`, { error: String(err) });
    }
  };
}

// POST /api/incoming-call — first webhook for every inbound call. Decides between ringing the
// owner and going straight to the AI, and returns TwiML inside the <1,500ms budget: the only
// synchronous I/O is the (usually cached) line lookup and, after hours, one quota RPC.
export async function handleIncomingCall(params: Params, deps: TelephonyDeps): Promise<WebhookResponse> {
  const { CallSid: callSid, From: from, To: to } = params;
  if (!callSid || !to) return { status: 400 };

  let line: LineConfig | null;
  try {
    ({ config: line } = await deps.lines.resolve(to));
  } catch (err) {
    // No config and no cache: a 5xx makes Twilio switch to the number's VoiceFallbackUrl
    // (the edge fail-open worker), which rings the owner without touching our stack.
    deps.logger.error('Line lookup failed with no cached config; deferring to VoiceFallbackUrl', { to, error: String(err) });
    return { status: 503 };
  }

  if (!line) {
    deps.logger.warn('Inbound call to unprovisioned number', { to, callSid });
    return { status: 200, twiml: deps.telephony.buildRejectTwiML() };
  }

  const aiSipUri = aiSipUriFor(line, deps);
  const afterHours = !isWithinBusinessHours(line.businessHours, line.timezone, deps.now());
  const directToAi =
    afterHours && line.afterHoursDirectToAi && aiSipUri !== null && (await hasVoiceQuota(line, deps));

  const twiml = directToAi
    ? sipHandoff(aiSipUri!, line, callSid, deps)
    : deps.telephony.buildForwardTwiML({
        forwardToNumber: line.forwardToNumber,
        ringTimeoutSeconds: line.forwardTimeoutSeconds,
        actionUrl: deps.actionUrl('forward'),
      });

  const lineConfig = line;
  return {
    status: 200,
    twiml,
    background: E164.test(from ?? '')
      ? safely(deps, 'Initial call log write', () =>
          deps.repo.upsertCallLog({
            callSid,
            organizationId: lineConfig.organizationId,
            fromNumber: from,
            toNumber: lineConfig.twilioPhoneNumber,
            status: 'ringing',
            outcome: directToAi ? 'forwarded_to_ai' : undefined,
          })
        )
      : undefined,
  };
}

// POST /api/incoming-call/action?leg=forward|ai — Twilio's <Dial action> callback once the
// dialed leg ends. The caller may still be on the line, so this must always return TwiML.
export async function handleDialAction(params: Params, leg: DialLeg, deps: TelephonyDeps): Promise<WebhookResponse> {
  const { CallSid: callSid, From: from, To: to, DialCallStatus: dialStatus, DialCallSid: dialCallSid } = params;
  if (!callSid || !to || !dialStatus) return { status: 400 };

  const hangup = (message?: string): WebhookResponse => ({ status: 200, twiml: deps.telephony.buildHangupTwiML(message) });

  let line: LineConfig | null;
  try {
    ({ config: line } = await deps.lines.resolve(to));
  } catch (err) {
    deps.logger.error('Line lookup failed during dial action', { to, callSid, error: String(err) });
    const buffer = deps.replayBuffer;
    const background = buffer
      ? safely(deps, 'Replay buffer enqueue', () => buffer.enqueue('twilio-dial-action', { ...params, leg }))
      : undefined;
    // Degraded mode (DESIGN_NOTES §6): still try the platform default AI receptionist.
    const fallbackSipUri = deps.killSwitch ? undefined : deps.vapi.defaultSipUri;
    if (leg === 'forward' && dialStatus !== 'completed' && dialStatus !== 'canceled' && fallbackSipUri) {
      return {
        status: 200,
        twiml: deps.telephony.buildSipHandoffTwiML({ sipEndpoint: fallbackSipUri }),
        background,
      };
    }
    return { ...hangup(dialStatus === 'completed' ? undefined : UNAVAILABLE_MESSAGE), background };
  }

  if (!line) return hangup();
  const lineConfig = line;

  const record = (outcome?: CallOutcome) =>
    E164.test(from ?? '')
      ? safely(deps, 'Dial action call log write', () =>
          deps.repo.upsertCallLog({
            callSid,
            organizationId: lineConfig.organizationId,
            fromNumber: from,
            toNumber: lineConfig.twilioPhoneNumber,
            outcome,
            childCallSid: dialCallSid,
          })
        )
      : undefined;

  const rescue = (outcome: CallOutcome | undefined, outcomeIfSent?: CallOutcome) =>
    safely(deps, 'Rescue SMS', async () => {
      const result = await rescueMissedCall({ line: lineConfig, callSid, callerNumber: from ?? '', outcome, outcomeIfSent }, deps);
      await recordRescueOutcome(deps, callSid, lineConfig.organizationId, result);
      if (E164.test(from ?? '')) await notifyMissedCall(lineConfig, callSid, from, result === 'sent', deps);
    });

  if (dialStatus === 'completed') {
    // Forward leg: a human (or carrier voicemail, see DESIGN_NOTES §2) picked up.
    // AI leg: the conversation happened; the Vapi end-of-call report owns the final outcome.
    return { ...hangup(), background: leg === 'forward' ? record('answered_by_business') : record() };
  }

  if (dialStatus === 'canceled') {
    // The caller hung up while we were still ringing; text them right away.
    return { ...hangup(), background: rescue(leg === 'ai' ? 'caller_abandoned_before_ai' : 'caller_abandoned') };
  }

  // no-answer / busy / failed: the caller is still holding.
  if (leg === 'forward') {
    const sipUri = aiSipUriFor(lineConfig, deps);
    if (sipUri && (await hasVoiceQuota(lineConfig, deps))) {
      return { status: 200, twiml: sipHandoff(sipUri, lineConfig, callSid, deps), background: record('forwarded_to_ai') };
    }
    return { ...hangup(UNAVAILABLE_MESSAGE), background: rescue(undefined, 'missed_call_texted') };
  }

  // The AI leg itself failed to connect (Vapi down, SIP error): fail open to a text-back.
  deps.logger.warn('AI SIP leg did not connect', { callSid, dialStatus });
  return { ...hangup(UNAVAILABLE_MESSAGE), background: rescue(undefined, 'missed_call_texted') };
}

// POST /api/incoming-call/status — parent-call StatusCallback (configured on the Twilio number).
// Not caller-facing, so work runs inline and failures can be buffered for replay.
export async function handleCallStatus(params: Params, deps: TelephonyDeps): Promise<WebhookResponse> {
  const { CallSid: callSid, CallStatus: callStatus, From: from, To: to, CallDuration: callDuration } = params;
  if (!callSid || !to || !callStatus) return { status: 400 };
  if (!CALL_STATUSES.has(callStatus) || !E164.test(from ?? '')) return { status: 204 };

  const status = callStatus as CallStatus;
  const eventId = `call-status:${callSid}:${status}`;

  try {
    if ((await deps.repo.beginWebhookEvent('twilio', eventId, params)) === 'duplicate') {
      return { status: 204 };
    }

    const { config: line } = await deps.lines.resolve(to);
    if (!line) return { status: 204 };

    const duration = Number.parseInt(callDuration ?? '', 10);
    await deps.repo.upsertCallLog({
      callSid,
      organizationId: line.organizationId,
      fromNumber: from,
      toNumber: line.twilioPhoneNumber,
      status,
      durationSeconds: Number.isFinite(duration) ? duration : undefined,
      endedAt: TERMINAL_STATUSES.has(status) ? deps.now().toISOString() : undefined,
    });
    await deps.repo.completeWebhookEvent('twilio', eventId);
    return { status: 204 };
  } catch (err) {
    deps.logger.error('Call status write failed', { callSid, status, error: String(err) });
    if (!deps.replayBuffer) return { status: 500 };
    try {
      await deps.replayBuffer.enqueue('twilio-call-status', params);
      return { status: 202 };
    } catch (bufferErr) {
      deps.logger.error('Replay buffer enqueue failed', { callSid, error: String(bufferErr) });
      return { status: 500 };
    }
  }
}
