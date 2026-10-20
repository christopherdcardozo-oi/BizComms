// Module B tests: Vapi webhook auth, report parsing, call correlation, Case B outcomes and
// rescue texts, voice metering, and receptionist provisioning.
// Run with: npx sucrase-node tests/voice.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockVoiceAiProvider } from '../src/lib/providers/voice-ai/mock';
import { handleDialAction, handleIncomingCall } from '../src/lib/telephony/handlers';
import { isAuthorizedVapiRequest } from '../src/lib/voice/auth';
import { provisionReceptionist, type ReceptionistStore } from '../src/lib/voice/receptionist';
import { parseVapiServerMessage } from '../src/lib/voice/report';
import { classifyAiCall, handleVapiWebhook } from '../src/lib/voice/webhook';
import { CALL, LINE, TUESDAY_8PM_CHICAGO, makeDeps, runAll } from './support/telephony-fakes';

const SECRET = 'vapi-test-secret';
const authed = (extra: Record<string, string> = {}) => new Headers({ authorization: `Bearer ${SECRET}`, ...extra });

// Shaped after Vapi's documented end-of-call-report + Call object.
function report(overrides: {
  id?: string;
  endedReason?: string;
  seconds?: number;
  customer?: string;
  phoneNumberId?: string | null;
  callSidVariable?: string | null;
  summary?: string;
} = {}) {
  const started = new Date('2026-10-21T01:00:00Z');
  const ended = new Date(started.getTime() + (overrides.seconds ?? 95) * 1000);
  return JSON.stringify({
    message: {
      type: 'end-of-call-report',
      endedReason: overrides.endedReason ?? 'customer-ended-call',
      call: {
        id: overrides.id ?? 'vapi-call-1',
        type: 'inboundPhoneCall',
        phoneNumberId: overrides.phoneNumberId === undefined ? 'vapi-pn-acme' : overrides.phoneNumberId,
        customer: { number: overrides.customer ?? CALL.From },
        startedAt: started.toISOString(),
        endedAt: ended.toISOString(),
        ...(overrides.callSidVariable === null
          ? {}
          : { assistantOverrides: { variableValues: { bizcomms_call_sid: overrides.callSidVariable ?? CALL.CallSid, bizcomms_org_id: LINE.organizationId } } }),
      },
      artifact: { transcript: 'AI: Thanks for calling Acme...', recording: { url: 'https://storage.vapi.ai/rec.wav' } },
      analysis: { summary: overrides.summary ?? 'Caller needs a drain unclogged tomorrow morning.' },
    },
  });
}

// An after-hours call Module A sends straight to the AI, so a forwarded_to_ai call log exists.
async function aiHandoff() {
  const ctx = makeDeps({ now: () => TUESDAY_8PM_CHICAGO });
  const res = await handleIncomingCall(CALL, ctx.deps);
  assert.match(res.twiml!, /<Sip>sip:bizcomms-org-acme@sip\.vapi\.ai/);
  await runAll(res);
  return ctx;
}

// ---------------------------------------------------------------------------
// Auth and parsing
// ---------------------------------------------------------------------------
test('auth: Bearer token or legacy X-Vapi-Secret, constant-time; fails closed', () => {
  assert.equal(isAuthorizedVapiRequest(new Headers({ authorization: `Bearer ${SECRET}` }), SECRET), true);
  assert.equal(isAuthorizedVapiRequest(new Headers({ 'x-vapi-secret': SECRET }), SECRET), true);
  assert.equal(isAuthorizedVapiRequest(new Headers({ authorization: 'Bearer nope' }), SECRET), false);
  assert.equal(isAuthorizedVapiRequest(new Headers({}), SECRET), false);
  assert.equal(isAuthorizedVapiRequest(new Headers({ authorization: `Bearer ${SECRET}` }), undefined), false);
});

test('parse: end-of-call-report fields, duration from timestamps, other types passed through', () => {
  const parsed = parseVapiServerMessage(JSON.parse(report({ seconds: 42 })));
  assert.equal(parsed?.type, 'end-of-call-report');
  if (parsed?.type !== 'end-of-call-report') return;
  assert.deepEqual(parsed.report, {
    vapiCallId: 'vapi-call-1',
    endedReason: 'customer-ended-call',
    customerNumber: CALL.From,
    phoneNumberId: 'vapi-pn-acme',
    durationSeconds: 42,
    transcript: 'AI: Thanks for calling Acme...',
    summary: 'Caller needs a drain unclogged tomorrow morning.',
    recordingUrl: 'https://storage.vapi.ai/rec.wav',
    correlation: { callSid: CALL.CallSid, organizationId: LINE.organizationId },
  });
  assert.deepEqual(parseVapiServerMessage({ message: { type: 'status-update', status: 'ended' } }), { type: 'other', messageType: 'status-update' });
  assert.equal(parseVapiServerMessage({ nope: true }), null);
});

test('parse: correlation header is found in a SIP header list too (case-insensitive, x- optional)', () => {
  const body = JSON.parse(report({ callSidVariable: null }));
  body.message.call.phoneCallProviderDetails = { sip: { headers: [{ name: 'X-BIZCOMMS_CALL_SID', value: 'CA-from-header' }] } };
  const parsed = parseVapiServerMessage(body);
  assert.equal(parsed?.type === 'end-of-call-report' && parsed.report.correlation.callSid, 'CA-from-header');
});

test('classify: AI failure rescues; short call is an abandon; otherwise completed', () => {
  assert.deepEqual(classifyAiCall({ endedReason: 'pipeline-error-openai-llm-failed', durationSeconds: 40 }, 8), {
    rescue: true,
    outcomeIfSent: 'missed_call_texted',
  });
  assert.deepEqual(classifyAiCall({ endedReason: 'customer-ended-call', durationSeconds: 3 }, 8), {
    outcome: 'caller_abandoned_before_ai',
    rescue: true,
  });
  assert.deepEqual(classifyAiCall({ endedReason: 'customer-ended-call', durationSeconds: 95 }, 8), {
    outcome: 'ai_conversation_completed',
    rescue: false,
  });
});

// ---------------------------------------------------------------------------
// Webhook flows
// ---------------------------------------------------------------------------
test('completed AI call: outcome, transcript and summary land on the Twilio call log; voice metered; no text', async () => {
  const { deps, repo, sms } = await aiHandoff();
  const res = await handleVapiWebhook(authed(), report(), deps);
  assert.deepEqual(res, { status: 200, body: { matched: true, source: 'header', outcome: 'ai_conversation_completed', rescue: null } });
  const log = repo.callLogs.get(CALL.CallSid)!;
  assert.equal(log.outcome, 'ai_conversation_completed');
  assert.equal(log.vapiCallId, 'vapi-call-1');
  assert.equal(log.summary, 'Caller needs a drain unclogged tomorrow morning.');
  assert.equal(log.recordingUrl, 'https://storage.vapi.ai/rec.wav');
  assert.equal(repo.voiceSeconds, 95);
  assert.equal(sms.sentMessages.length, 0);
});

test('caller hangs up on the AI within the abandon threshold: Case B rescue text, exactly once', async () => {
  const { deps, repo, sms } = await aiHandoff();
  const first = await handleVapiWebhook(authed(), report({ seconds: 3 }), deps);
  assert.equal(first.body.outcome, 'caller_abandoned_before_ai');
  assert.equal(first.body.rescue, 'sent');
  assert.equal(sms.sentMessages.length, 1);
  assert.equal(repo.callLogs.get(CALL.CallSid)?.outcome, 'caller_abandoned_before_ai');

  const again = await handleVapiWebhook(authed(), report({ seconds: 3 }), deps);
  assert.deepEqual(again.body, { duplicate: true });
  assert.equal(sms.sentMessages.length, 1);
  assert.equal(repo.voiceSeconds, 3, 'usage not double-counted on redelivery');
});

test('AI pipeline failure: the caller is texted back', async () => {
  const { deps, repo, sms } = await aiHandoff();
  const res = await handleVapiWebhook(authed(), report({ endedReason: 'pipeline-error-openai-llm-failed', seconds: 20 }), deps);
  assert.equal(res.body.rescue, 'sent');
  assert.equal(sms.sentMessages.length, 1);
  assert.equal(repo.callLogs.get(CALL.CallSid)?.outcome, 'missed_call_texted');
});

test('never double-texts when Module A already rescued the call', async () => {
  const { deps, sms } = await aiHandoff();
  // AI SIP leg failed at Twilio -> Module A texted the caller...
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'failed' }, 'ai', deps));
  assert.equal(sms.sentMessages.length, 1);
  // ...and Vapi still reports a short call for the same Twilio call.
  const res = await handleVapiWebhook(authed(), report({ seconds: 2 }), deps);
  assert.equal(res.body.rescue, 'already_rescued');
  assert.equal(sms.sentMessages.length, 1);
});

test('correlation falls back to the org Vapi number + caller when SIP headers are missing', async () => {
  const { deps, repo } = await aiHandoff();
  const res = await handleVapiWebhook(authed(), report({ callSidVariable: null }), deps);
  assert.equal(res.body.source, 'vapi_number');
  assert.equal(repo.callLogs.get(CALL.CallSid)?.vapiCallId, 'vapi-call-1');
});

test('caller-only correlation is used only when exactly one handoff matches', async () => {
  const { deps } = await aiHandoff();
  const unique = await handleVapiWebhook(authed(), report({ callSidVariable: null, phoneNumberId: null }), deps);
  assert.equal(unique.body.source, 'caller_only');

  // Same caller handed to AI by two different businesses: ambiguous, so nothing is written.
  const ctx = await aiHandoff();
  ctx.repo.callLogs.set('CA-other-biz', {
    callSid: 'CA-other-biz',
    organizationId: 'org-other',
    fromNumber: CALL.From,
    toNumber: '+12025550303',
    outcome: 'forwarded_to_ai',
    smsRescued: false,
    createdAt: TUESDAY_8PM_CHICAGO.toISOString(),
  });
  const ambiguous = await handleVapiWebhook(authed(), report({ id: 'vapi-call-9', callSidVariable: null, phoneNumberId: null }), ctx.deps);
  assert.deepEqual(ambiguous.body, { matched: false });
  assert.equal(ctx.repo.callLogs.get(CALL.CallSid)?.vapiCallId, undefined);
});

test('a second Vapi call cannot overwrite a call log already bound to another', async () => {
  const { deps, repo } = await aiHandoff();
  await handleVapiWebhook(authed(), report({ id: 'vapi-call-1' }), deps);
  const res = await handleVapiWebhook(authed(), report({ id: 'vapi-call-2', seconds: 2 }), deps);
  assert.deepEqual(res.body, { matched: false });
  assert.equal(repo.callLogs.get(CALL.CallSid)?.outcome, 'ai_conversation_completed');
});

test('unauthorized and non-report messages do no work; DB failure returns 500 and retries cleanly', async () => {
  const { deps, repo, sms } = await aiHandoff();
  assert.equal((await handleVapiWebhook(new Headers({ authorization: 'Bearer wrong' }), report({ seconds: 2 }), deps)).status, 401);
  const status = await handleVapiWebhook(authed(), JSON.stringify({ message: { type: 'status-update', status: 'ended' } }), deps);
  assert.deepEqual(status, { status: 200, body: {} });

  repo.failWrites = true;
  assert.equal((await handleVapiWebhook(authed(), report({ seconds: 2 }), deps)).status, 500);
  repo.failWrites = false;
  const retry = await handleVapiWebhook(authed(), report({ seconds: 2 }), deps);
  assert.equal(retry.body.rescue, 'sent');
  assert.equal(sms.sentMessages.length, 1);
});

test('Module A: AI is never dialed for an org whose receptionist is not provisioned', async () => {
  const { deps, repo } = makeDeps({ now: () => TUESDAY_8PM_CHICAGO });
  repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, vapiPhoneNumberId: null });
  const res = await handleIncomingCall(CALL, deps);
  assert.match(res.twiml!, /<Number>\+12025550199<\/Number>/);
  assert.doesNotMatch(res.twiml!, /<Sip>/);
});

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------
test('provisioning creates the assistant + SIP number once, then updates in place', async () => {
  const provider = new MockVoiceAiProvider();
  const saved: Array<{ assistantId: string; phoneNumberId: string }> = [];
  const org = { name: 'Acme Plumbing', aiReceptionistPrompt: 'Mention we offer 24/7 emergency service.', vapiAssistantId: null as string | null, vapiPhoneNumberId: null as string | null };
  const store: ReceptionistStore = {
    getOrganization: async () => ({ ...org }),
    saveVapiIds: async (_id, ids) => {
      saved.push(ids);
      org.vapiAssistantId = ids.assistantId;
      org.vapiPhoneNumberId = ids.phoneNumberId;
    },
  };
  const deps = { provider, store, sipHost: 'sip.vapi.ai', webhookUrl: 'https://app.test/api/vapi/webhook' };

  assert.deepEqual(await provisionReceptionist('org-acme', deps), { ok: true });
  const created = provider.upserts[0];
  assert.equal(created.config.sipUri, 'sip:bizcomms-org-acme@sip.vapi.ai');
  assert.match(created.config.firstMessage, /automated assistant, and this call may be recorded/);
  assert.match(created.config.systemPrompt, /24\/7 emergency service/);
  assert.match(created.config.systemPrompt, /call 911/);

  await provisionReceptionist('org-acme', deps);
  assert.deepEqual(provider.upserts[1].existing, { assistantId: 'vapi_ast_mock_org-acme', phoneNumberId: 'vapi_pn_mock_org-acme' });
  assert.deepEqual(saved[0], saved[1], 'same ids, no duplicate resources');
});
