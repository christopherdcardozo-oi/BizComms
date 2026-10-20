import type { CallOutcome } from '../../types/database.types';
import type { ReplayOutcome, ReplayProcessor } from '../queue/replay-drain';
import { handleCallStatus } from './handlers';
import { E164 } from './rescue-sms';
import type { TelephonyDeps } from './types';

// Replays only the database writes of a buffered webhook. The caller is long gone, so no TwiML
// matters and no SMS is ever sent from here: a text minutes or hours late is not a rescue.
export function telephonyReplayProcessors(deps: TelephonyDeps): Record<string, ReplayProcessor> {
  // Without a buffer, handleCallStatus reports DB failure as 500 instead of re-enqueueing.
  const replayDeps: TelephonyDeps = { ...deps, replayBuffer: null };

  return {
    'twilio-call-status': async ({ payload }) => {
      const { status } = await handleCallStatus(payload, replayDeps);
      if (status >= 200 && status < 300) return 'done';
      return status === 400 ? 'drop' : 'retry';
    },
    'twilio-dial-action': ({ payload }) => replayDialActionLog(payload, replayDeps),
  };
}

function dialOutcome(leg: string, dialStatus: string): CallOutcome | undefined {
  if (dialStatus === 'completed') return leg === 'forward' ? 'answered_by_business' : undefined;
  if (dialStatus === 'canceled') return leg === 'ai' ? 'caller_abandoned_before_ai' : 'caller_abandoned';
  // no-answer/busy/failed: what happened next depended on the degraded-mode handoff, which
  // the payload cannot tell us; the Vapi report or status callback fills in the rest.
  return undefined;
}

export async function replayDialActionLog(payload: Record<string, string>, deps: TelephonyDeps): Promise<ReplayOutcome> {
  const { CallSid: callSid, From: from, To: to, DialCallStatus: dialStatus, DialCallSid: dialCallSid, leg } = payload;
  if (!callSid || !to || !dialStatus || (leg !== 'forward' && leg !== 'ai')) return 'drop';
  if (!E164.test(from ?? '')) return 'done'; // call_logs requires an E.164 caller; nothing to write

  const { config: line } = await deps.lines.resolve(to);
  if (!line) return 'done';

  await deps.repo.upsertCallLog({
    callSid,
    organizationId: line.organizationId,
    fromNumber: from,
    toNumber: line.twilioPhoneNumber,
    outcome: dialOutcome(leg, dialStatus),
    childCallSid: dialCallSid,
  });
  return 'done';
}
