import { CALL_SID_HEADER, ORG_ID_HEADER } from './sip';

// Provider-neutral view of Vapi's end-of-call-report. Field locations follow Vapi's server-event
// and Call object docs; anything undocumented is read defensively and may be null.
export interface AiCallReport {
  vapiCallId: string;
  endedReason: string | null;
  customerNumber: string | null;
  phoneNumberId: string | null;
  durationSeconds: number;
  transcript: string | null;
  summary: string | null;
  recordingUrl: string | null;
  correlation: { callSid: string | null; organizationId: string | null };
}

export type VapiServerMessage = { type: 'end-of-call-report'; report: AiCallReport } | { type: 'other'; messageType: string };

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

// Header/variable names normalized the way Vapi does: case-insensitive, "x-" prefix optional.
function headerKey(name: string): string {
  return name.toLowerCase().replace(/^x-/, '');
}

// Vapi doesn't document where inbound X- headers land in webhooks (they become template
// variables), so search the call object for our keys, bounded in depth and breadth.
export function findCorrelationValue(root: unknown, headerName: string, maxDepth = 6): string | null {
  const wanted = headerKey(headerName);
  const stack: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  let visited = 0;
  while (stack.length > 0 && visited < 2000) {
    const { node, depth } = stack.pop()!;
    visited++;
    const o = obj(node);
    if (!o) {
      if (Array.isArray(node) && depth < maxDepth) for (const item of node) stack.push({ node: item, depth: depth + 1 });
      continue;
    }
    for (const [key, value] of Object.entries(o)) {
      if (headerKey(key) === wanted && str(value)) return value as string;
      // Header lists shaped like [{ name: "X-...", value: "..." }]
      if ((key === 'name' || key === 'key') && typeof value === 'string' && headerKey(value) === wanted && str(o.value)) {
        return o.value as string;
      }
      if (depth < maxDepth && typeof value === 'object' && value !== null) stack.push({ node: value, depth: depth + 1 });
    }
  }
  return null;
}

function durationOf(message: Json, call: Json | null): number {
  const explicit = message.durationSeconds;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.max(0, Math.round(explicit));
  const started = Date.parse(str(message.startedAt) ?? str(call?.startedAt) ?? '');
  const ended = Date.parse(str(message.endedAt) ?? str(call?.endedAt) ?? '');
  return Number.isFinite(started) && Number.isFinite(ended) && ended >= started ? Math.round((ended - started) / 1000) : 0;
}

export function parseVapiServerMessage(body: unknown): VapiServerMessage | null {
  const message = obj(obj(body)?.message);
  const type = str(message?.type);
  if (!message || !type) return null;
  if (type !== 'end-of-call-report') return { type: 'other', messageType: type };

  const call = obj(message.call);
  const vapiCallId = str(call?.id);
  if (!vapiCallId) return null;

  const artifact = obj(message.artifact) ?? obj(call?.artifact);
  const recording = obj(artifact?.recording);
  const analysis = obj(message.analysis) ?? obj(call?.analysis);

  return {
    type: 'end-of-call-report',
    report: {
      vapiCallId,
      endedReason: str(message.endedReason) ?? str(call?.endedReason),
      customerNumber: str(obj(call?.customer)?.number),
      phoneNumberId: str(call?.phoneNumberId),
      durationSeconds: durationOf(message, call),
      transcript: str(artifact?.transcript),
      summary: str(analysis?.summary),
      recordingUrl: str(recording?.url) ?? str(recording?.mono && obj(recording.mono)?.combinedUrl) ?? str(artifact?.recordingUrl),
      correlation: {
        callSid: findCorrelationValue(call, CALL_SID_HEADER),
        organizationId: findCorrelationValue(call, ORG_ID_HEADER),
      },
    },
  };
}
