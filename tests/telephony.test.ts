// Module A unit tests: webhook handlers, rescue SMS gates, line cache, business hours and
// Twilio signature validation. Run with: npx sucrase-node tests/telephony.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import twilio from 'twilio';
import { TwilioTelephonyProvider } from '../src/lib/providers/telephony/twilio';
import { isWithinBusinessHours } from '../src/lib/telephony/business-hours';
import { handleCallStatus, handleDialAction, handleIncomingCall } from '../src/lib/telephony/handlers';
import { LineConfigCache } from '../src/lib/telephony/line-cache';
import { renderRescueSms } from '../src/lib/telephony/rescue-sms';
import { verifyTwilioWebhook } from '../src/lib/twilio/validate';
import {
  CALL,
  InMemoryRepo,
  LINE,
  TUESDAY_10AM_CHICAGO,
  TUESDAY_8PM_CHICAGO,
  WEEKDAY_HOURS,
  makeDeps,
  runAll,
} from './support/telephony-fakes';
// ---------------------------------------------------------------------------
// Business hours
// ---------------------------------------------------------------------------
test('business hours: inside and outside weekday window', () => {
  assert.equal(isWithinBusinessHours(WEEKDAY_HOURS, 'America/Chicago', TUESDAY_10AM_CHICAGO), true);
  assert.equal(isWithinBusinessHours(WEEKDAY_HOURS, 'America/Chicago', TUESDAY_8PM_CHICAGO), false);
});

test('business hours: overnight window spills into next day, closed days are closed', () => {
  // Friday 23:00 and Saturday 01:30 Chicago are inside Friday 22:00-02:00; Saturday 03:00 is not.
  assert.equal(isWithinBusinessHours(WEEKDAY_HOURS, 'America/Chicago', new Date('2026-10-24T04:00:00Z')), true);
  assert.equal(isWithinBusinessHours(WEEKDAY_HOURS, 'America/Chicago', new Date('2026-10-24T06:30:00Z')), true);
  assert.equal(isWithinBusinessHours(WEEKDAY_HOURS, 'America/Chicago', new Date('2026-10-24T08:00:00Z')), false);
});

test('business hours: missing config or bad timezone is treated as open', () => {
  assert.equal(isWithinBusinessHours(null, 'America/Chicago', TUESDAY_8PM_CHICAGO), true);
  assert.equal(isWithinBusinessHours(WEEKDAY_HOURS, 'Not/AZone', TUESDAY_8PM_CHICAGO), true);
});

// ---------------------------------------------------------------------------
// Line config cache
// ---------------------------------------------------------------------------
test('line cache: serves stale config when the DB fails, throws when nothing cached', async () => {
  let clock = 0;
  const repo = new InMemoryRepo();
  const cache = new LineConfigCache(repo, { freshMs: 1000, staleMs: 10_000, now: () => clock });
  assert.equal((await cache.resolve(LINE.twilioPhoneNumber)).source, 'db');
  clock = 500;
  assert.equal((await cache.resolve(LINE.twilioPhoneNumber)).source, 'cache');
  repo.failLookups = true;
  clock = 5000;
  assert.equal((await cache.resolve(LINE.twilioPhoneNumber)).source, 'stale');
  clock = 20_000;
  await assert.rejects(cache.resolve(LINE.twilioPhoneNumber));
  await assert.rejects(cache.resolve('+19995550000'));
});

// ---------------------------------------------------------------------------
// /api/incoming-call
// ---------------------------------------------------------------------------
test('incoming: business hours forwards to owner with action callback', async () => {
  const { deps, repo } = makeDeps();
  const res = await handleIncomingCall(CALL, deps);
  assert.equal(res.status, 200);
  assert.match(res.twiml!, /<Dial timeout="15" action="https:\/\/app\.test\/api\/incoming-call\/action\?leg=forward" method="POST"><Number>\+12025550199<\/Number><\/Dial>/);
  await runAll(res);
  assert.equal(repo.callLogs.get('CA100')?.status, 'ringing');
});

test('incoming: after hours goes straight to the AI with correlation SIP headers', async () => {
  const { deps, repo } = makeDeps({ now: () => TUESDAY_8PM_CHICAGO });
  const res = await handleIncomingCall(CALL, deps);
  assert.match(res.twiml!, /action="https:\/\/app\.test\/api\/incoming-call\/action\?leg=ai"/);
  assert.match(res.twiml!, /<Sip>sip:ast-acme@sip\.vapi\.ai\?X-BizComms-Org-Id=org-acme&amp;X-BizComms-Call-Sid=CA100<\/Sip>/);
  await runAll(res);
  assert.equal(repo.callLogs.get('CA100')?.outcome, 'forwarded_to_ai');
});

test('incoming: after hours but over voice quota, kill switch, or inactive subscription rings the owner', async () => {
  for (const setup of [
    (r: InMemoryRepo) => (r.usage = { overVoiceLimit: true, overSmsLimit: false }),
    (r: InMemoryRepo) => r.lines.set(LINE.twilioPhoneNumber, { ...LINE, subscriptionStatus: 'canceled' }),
  ]) {
    const { deps, repo } = makeDeps({ now: () => TUESDAY_8PM_CHICAGO });
    setup(repo);
    const res = await handleIncomingCall(CALL, deps);
    assert.match(res.twiml!, /<Number>\+12025550199<\/Number>/);
  }
  const { deps } = makeDeps({ now: () => TUESDAY_8PM_CHICAGO, killSwitch: true });
  assert.match((await handleIncomingCall(CALL, deps)).twiml!, /<Number>/);
});

test('incoming: unknown number is rejected; DB outage without cache returns 503 for VoiceFallbackUrl', async () => {
  const { deps } = makeDeps();
  const unknown = await handleIncomingCall({ ...CALL, To: '+19995550000' }, deps);
  assert.match(unknown.twiml!, /<Reject\/>/);

  const fresh = makeDeps();
  fresh.repo.failLookups = true;
  assert.equal((await handleIncomingCall(CALL, fresh.deps)).status, 503);
});

test('incoming: anonymous caller still routes but skips the E.164-constrained call log', async () => {
  const { deps } = makeDeps();
  const res = await handleIncomingCall({ ...CALL, From: 'anonymous' }, deps);
  assert.match(res.twiml!, /<Number>/);
  assert.equal(res.background, undefined);
});

// ---------------------------------------------------------------------------
// /api/incoming-call/action
// ---------------------------------------------------------------------------
test('action: owner answered -> hang up and record answered_by_business', async () => {
  const { deps, repo, sms } = makeDeps();
  const res = await handleDialAction({ ...CALL, DialCallStatus: 'completed', DialCallSid: 'CA200' }, 'forward', deps);
  assert.match(res.twiml!, /<Hangup\/>/);
  await runAll(res);
  assert.equal(repo.callLogs.get('CA100')?.outcome, 'answered_by_business');
  assert.equal(repo.callLogs.get('CA100')?.childCallSid, 'CA200');
  assert.equal(sms.sentMessages.length, 0);
});

test('action: owner no-answer hands off to AI', async () => {
  const { deps, sms } = makeDeps();
  const res = await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', deps);
  assert.match(res.twiml!, /<Sip>sip:ast-acme@sip\.vapi\.ai/);
  await runAll(res);
  assert.equal(sms.sentMessages.length, 0);
});

test('action: owner no-answer with AI disabled texts the caller via the A2P messaging service', async () => {
  const { deps, repo, sms } = makeDeps();
  repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, aiVoiceEnabled: false });
  const res = await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', deps);
  assert.match(res.twiml!, /<Say>.*<\/Say><Hangup\/>/);
  await runAll(res);
  assert.equal(sms.sentMessages.length, 1);
  assert.equal(sms.sentMessages[0].to, CALL.From);
  assert.equal(sms.sentMessages[0].messagingServiceSid, 'MG123');
  assert.match(sms.sentMessages[0].body, /^Hi, this is Acme Plumbing & Drain!.*Reply STOP to opt out\.$/);
  assert.equal(repo.callLogs.get('CA100')?.outcome, 'missed_call_texted');
  assert.equal(repo.messages.length, 1);
  assert.equal(repo.smsUsage, 1);
});

test('action: caller hangs up while ringing -> rescue SMS with caller_abandoned outcome', async () => {
  const { deps, repo, sms } = makeDeps();
  const res = await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', deps);
  await runAll(res);
  assert.equal(sms.sentMessages.length, 1);
  assert.equal(repo.callLogs.get('CA100')?.outcome, 'caller_abandoned');
  assert.equal(repo.callLogs.get('CA100')?.smsRescued, true);
});

test('action: caller hangs up before AI connects -> caller_abandoned_before_ai', async () => {
  const { deps, repo } = makeDeps();
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'ai', deps));
  assert.equal(repo.callLogs.get('CA100')?.outcome, 'caller_abandoned_before_ai');
});

test('action: AI SIP leg fails -> fail open to text-back', async () => {
  const { deps, sms } = makeDeps();
  const res = await handleDialAction({ ...CALL, DialCallStatus: 'failed' }, 'ai', deps);
  assert.match(res.twiml!, /<Hangup\/>/);
  await runAll(res);
  assert.equal(sms.sentMessages.length, 1);
});

test('rescue SMS gates: opt-out, unapproved A2P, SMS quota, kill switch all block the text', async () => {
  const cases: Array<(r: InMemoryRepo) => void> = [
    (r) => r.optOuts.add(`org-acme:${CALL.From}`),
    (r) => (r.a2p = { status: 'pending', messagingServiceSid: null }),
    (r) => (r.usage = { overVoiceLimit: false, overSmsLimit: true }),
  ];
  for (const setup of cases) {
    const { deps, repo, sms } = makeDeps();
    setup(repo);
    await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', deps));
    assert.equal(sms.sentMessages.length, 0);
  }
  const killed = makeDeps({ killSwitch: true });
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', killed.deps));
  assert.equal(killed.sms.sentMessages.length, 0);
});

test('rescue SMS is at-most-once even when the action callback is delivered twice', async () => {
  const { deps, sms } = makeDeps();
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', deps));
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', deps));
  assert.equal(sms.sentMessages.length, 1);
});

test('action: DB outage falls back to platform default assistant and buffers the payload', async () => {
  const { deps, repo, buffered } = makeDeps({ vapi: { sipEndpoint: 'sip.vapi.ai', defaultAssistantId: 'ast-default' } });
  repo.failLookups = true;
  const res = await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', deps);
  assert.match(res.twiml!, /<Sip>sip:ast-default@sip\.vapi\.ai<\/Sip>/);
  await runAll(res);
  assert.equal(buffered[0].kind, 'twilio-dial-action');
});

test('renderRescueSms keeps an existing STOP notice', () => {
  assert.equal(renderRescueSms('Hi from {{ business_name }}. Text STOP to quit.', 'Acme'), 'Hi from Acme. Text STOP to quit.');
});

// ---------------------------------------------------------------------------
// /api/incoming-call/status
// ---------------------------------------------------------------------------
test('status: terminal callback records duration and end time; duplicate is ignored', async () => {
  const { deps, repo } = makeDeps();
  const params = { ...CALL, CallStatus: 'completed', CallDuration: '37' };
  assert.equal((await handleCallStatus(params, deps)).status, 204);
  const log = repo.callLogs.get('CA100')!;
  assert.equal(log.status, 'completed');
  assert.equal(log.durationSeconds, 37);
  assert.equal(log.endedAt, TUESDAY_10AM_CHICAGO.toISOString());
  const writes = repo.upsertCalls;
  assert.equal((await handleCallStatus(params, deps)).status, 204);
  assert.equal(repo.upsertCalls, writes);
});

test('status: DB failure buffers for replay (202), or 500 when no buffer is configured', async () => {
  const buffered = makeDeps();
  buffered.repo.failWrites = true;
  assert.equal((await handleCallStatus({ ...CALL, CallStatus: 'completed' }, buffered.deps)).status, 202);
  assert.equal(buffered.buffered[0].kind, 'twilio-call-status');

  const unbuffered = makeDeps({ replayBuffer: null });
  unbuffered.repo.failWrites = true;
  assert.equal((await handleCallStatus({ ...CALL, CallStatus: 'completed' }, unbuffered.deps)).status, 500);
});

// ---------------------------------------------------------------------------
// Signature validation & TwiML escaping
// ---------------------------------------------------------------------------
test('signature: validates against TWILIO_WEBHOOK_BASE_URL, not the proxied request host', async () => {
  process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
  process.env.TWILIO_WEBHOOK_BASE_URL = 'https://public.bizcomms.test';
  const params = { ...CALL, DialCallStatus: 'no-answer' };
  const publicUrl = 'https://public.bizcomms.test/api/incoming-call/action?leg=forward';
  const signature = twilio.getExpectedTwilioSignature('test-auth-token', publicUrl, params);
  const makeRequest = (sig: string) =>
    new Request('http://10.0.0.5:3000/api/incoming-call/action?leg=forward', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig },
      body: new URLSearchParams(params).toString(),
    });

  const provider = new TwilioTelephonyProvider();
  const ok = await verifyTwilioWebhook(makeRequest(signature), provider);
  assert.equal(ok.ok, true);
  assert.equal((await verifyTwilioWebhook(makeRequest('forged'), provider)).ok, false);
  assert.equal((await verifyTwilioWebhook(makeRequest(''), provider)).ok, false);
});

test('TwiML builders escape untrusted text', () => {
  const twiml = new TwilioTelephonyProvider().buildHangupTwiML('Tom & Jerry <Plumbing>');
  assert.match(twiml, /<Say>Tom &amp; Jerry &lt;Plumbing&gt;<\/Say>/);
});
