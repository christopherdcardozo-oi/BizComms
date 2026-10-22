import type { CallOutcome } from '../../types/database.types';
import { notifyAiCall, notifyMissedCall } from '../owner/alerts';
import { E164, rescueMissedCall } from '../telephony/rescue-sms';
import type { CallRef, TelephonyDeps } from '../telephony/types';
import { isAuthorizedVapiRequest } from './auth';
import { parseVapiServerMessage, type AiCallReport } from './report';

const DEFAULT_ABANDON_THRESHOLD_SECONDS = 8;
// How far back a caller's AI handoff can be matched when SIP headers don't come through.
// Generous because the report arrives when the AI call *ends* (max 10 min) plus retries.
const HANDOFF_LOOKBACK_MS = 2 * 60 * 60_000;

// endedReasons where the AI itself failed (setup, voice/LLM/transcriber pipeline, worker crash).
const AI_FAILURE = /(error|failed|fault|worker-shutdown|not-found|not-valid|join-timed-out|transport-never-connected)/i;

export interface AiCallClassification {
  outcome?: CallOutcome;
  rescue: boolean;
  outcomeIfSent?: CallOutcome;
}

// DESIGN_NOTES §1, Case B: the Vapi report is the single source of truth once the AI leg
// connected. A caller who hangs up within the org's abandon threshold, or an AI that failed,
// gets the same instant text-back as a missed call.
export function classifyAiCall(report: Pick<AiCallReport, 'endedReason' | 'durationSeconds'>, abandonThresholdSeconds: number): AiCallClassification {
  if (report.endedReason && AI_FAILURE.test(report.endedReason)) {
    return { rescue: true, outcomeIfSent: 'missed_call_texted' };
  }
  if (report.durationSeconds < abandonThresholdSeconds) {
    return { outcome: 'caller_abandoned_before_ai', rescue: true };
  }
  return { outcome: 'ai_conversation_completed', rescue: false };
}

export type CorrelationSource = 'header' | 'vapi_number' | 'caller_only';

// Matches the Vapi call to the Twilio call it continues, strongest evidence first.
export async function correlateAiCall(
  report: AiCallReport,
  deps: Pick<TelephonyDeps, 'repo' | 'now'>
): Promise<{ ref: CallRef; source: CorrelationSource } | null> {
  const { repo } = deps;

  // 1. Our SIP X- header (callSid), cross-checked against the org header when present.
  if (report.correlation.callSid) {
    const ref = await repo.findCallBySid(report.correlation.callSid);
    const orgMatches = !report.correlation.organizationId || ref?.organizationId === report.correlation.organizationId;
    if (ref && orgMatches && (!ref.vapiCallId || ref.vapiCallId === report.vapiCallId)) return { ref, source: 'header' };
  }

  if (!report.customerNumber || !E164.test(report.customerNumber)) return null;
  const since = new Date(deps.now().getTime() - HANDOFF_LOOKBACK_MS).toISOString();

  // 2. The org's own Vapi SIP number + the caller: their most recent unbound AI handoff.
  if (report.phoneNumberId) {
    const organizationId = await repo.findOrganizationByVapiPhoneNumber(report.phoneNumberId);
    if (organizationId) {
      const [latest] = await repo.findRecentAiHandoffs(report.customerNumber, since, organizationId);
      if (latest) return { ref: latest, source: 'vapi_number' };
    }
  }

  // 3. Caller only, and only when unambiguous across all tenants.
  const candidates = await repo.findRecentAiHandoffs(report.customerNumber, since);
  return candidates.length === 1 ? { ref: candidates[0], source: 'caller_only' } : null;
}

export interface VapiWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

// POST /api/vapi/webhook. Responds to every message type (Vapi expects 2xx); only
// end-of-call-report does work. Failures return 500 and leave the event unprocessed.
export async function handleVapiWebhook(
  headers: { get(name: string): string | null },
  rawBody: string,
  deps: TelephonyDeps
): Promise<VapiWebhookResult> {
  if (!isAuthorizedVapiRequest(headers, deps.vapi.webhookSecret)) return { status: 401, body: { error: 'unauthorized' } };

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }
  const message = parseVapiServerMessage(json);
  if (!message) return { status: 400, body: { error: 'unrecognized message' } };
  if (message.type !== 'end-of-call-report') return { status: 200, body: {} };

  const { report } = message;
  const eventId = `end-of-call-report:${report.vapiCallId}`;

  try {
    if ((await deps.repo.beginWebhookEvent('vapi', eventId, { vapiCallId: report.vapiCallId })) === 'duplicate') {
      return { status: 200, body: { duplicate: true } };
    }

    const match = await correlateAiCall(report, deps);
    if (!match) {
      deps.logger.warn('Vapi call could not be matched to a Twilio call', { vapiCallId: report.vapiCallId });
      await deps.repo.completeWebhookEvent('vapi', eventId);
      return { status: 200, body: { matched: false } };
    }
    const { ref, source } = match;

    const { config: line } = await deps.lines.resolve(ref.toNumber);
    const classification = classifyAiCall(report, line?.abandonThresholdSeconds ?? DEFAULT_ABANDON_THRESHOLD_SECONDS);

    const applied = await deps.repo.applyAiCallReport({
      callSid: ref.callSid,
      organizationId: ref.organizationId,
      vapiCallId: report.vapiCallId,
      endedReason: report.endedReason,
      outcome: classification.outcome,
      durationSeconds: report.durationSeconds,
      transcript: report.transcript,
      summary: report.summary,
      recordingUrl: report.recordingUrl,
    });
    if (!applied) {
      deps.logger.warn('Call log already bound to a different Vapi call', { callSid: ref.callSid, vapiCallId: report.vapiCallId });
      await deps.repo.completeWebhookEvent('vapi', eventId);
      return { status: 200, body: { matched: false } };
    }

    let rescue: string | undefined;
    if (classification.rescue && line) {
      // claim_sms_rescue makes this at-most-once even if Module A already texted the caller.
      rescue = await rescueMissedCall(
        { line, callSid: ref.callSid, callerNumber: ref.fromNumber, outcome: classification.outcome, outcomeIfSent: classification.outcomeIfSent },
        deps
      );
    }
    // Owner alert (never throws): a failed AI call reads as a missed call, otherwise the summary.
    if (line) {
      if (classification.rescue) await notifyMissedCall(line, ref.callSid, ref.fromNumber, rescue === 'sent', deps);
      else await notifyAiCall(line, ref.callSid, ref.fromNumber, report.summary, deps);
    }

    if (report.durationSeconds > 0) await deps.repo.incrementVoiceUsage(ref.organizationId, report.durationSeconds);
    await deps.repo.completeWebhookEvent('vapi', eventId);
    return { status: 200, body: { matched: true, source, outcome: classification.outcome ?? null, rescue: rescue ?? null } };
  } catch (err) {
    deps.logger.error('Vapi webhook processing failed', { vapiCallId: report.vapiCallId, error: String(err) });
    return { status: 500, body: { error: 'retry' } };
  }
}
