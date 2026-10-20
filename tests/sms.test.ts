// Module C unit tests: keyword classification, inbound SMS router, opt-out engine, delivery
// receipts and their interaction with the missed-call text-back.
// Run with: npx sucrase-node tests/sms.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drainReplayBuffer, replayKeys, type ReplayListStore } from '../src/lib/queue/replay-drain';
import { handleInboundSms, handleSmsStatus } from '../src/lib/sms/handlers';
import { classifyInboundSms } from '../src/lib/sms/keywords';
import { handleDialAction } from '../src/lib/telephony/handlers';
import { telephonyReplayProcessors } from '../src/lib/telephony/replay';
import { CALL, LINE, makeDeps, runAll } from './support/telephony-fakes';

const CUSTOMER = CALL.From;
const KEY = `${LINE.organizationId}:${CUSTOMER}`;
let sidCounter = 0;
const sms = (body: string, extra: Record<string, string> = {}) => ({
  MessageSid: `SM${++sidCounter}`,
  From: CUSTOMER,
  To: LINE.twilioPhoneNumber,
  Body: body,
  ...extra,
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
test('classify: standard keywords are whole-message, case-insensitive, punctuation-tolerant', () => {
  for (const body of ['STOP', 'stop', '  Stop! ', 'STOP ALL', 'Unsubscribe', 'cancel', 'quit.', 'OptOut', 'REVOKE']) {
    assert.deepEqual(classifyInboundSms(body), { intent: 'opt_out', source: 'keyword' }, body);
  }
  for (const body of ['START', 'unstop', 'Yes']) assert.equal(classifyInboundSms(body).intent, 'opt_in', body);
  for (const body of ['HELP', 'info?']) assert.equal(classifyInboundSms(body).intent, 'help', body);
});

test('classify: plain-language revocation is an opt-out (FCC reasonable-means rule)', () => {
  for (const body of ['Please stop texting me', "don't text me again", 'Remove me from your list', 'wrong number', 'take me off this']) {
    assert.deepEqual(classifyInboundSms(body), { intent: 'opt_out', source: 'phrase' }, body);
  }
});

test('classify: ordinary messages that merely contain keywords are not opt-outs', () => {
  for (const body of ['Can you come at 3?', 'I need to stop a leak under my sink', 'Cancel my appointment please', 'Yes 3pm works']) {
    assert.deepEqual(classifyInboundSms(body), { intent: 'message', source: 'none' }, body);
  }
});

test("classify: Twilio's OptOutType parameter wins", () => {
  assert.deepEqual(classifyInboundSms('Stop', 'STOP'), { intent: 'opt_out', source: 'carrier' });
  assert.deepEqual(classifyInboundSms('anything', 'HELP'), { intent: 'help', source: 'carrier' });
});

// ---------------------------------------------------------------------------
// Inbound router
// ---------------------------------------------------------------------------
test('inbound STOP (Twilio answers keywords): opt-out recorded, message stored, no app reply', async () => {
  const { deps, repo } = makeDeps();
  const res = await handleInboundSms(sms('STOP'), deps);
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.twiml!, /<Message>/);
  assert.ok(repo.optOuts.has(KEY));
  assert.equal(repo.optOutSources.get(KEY), 'inbound_stop');
  assert.equal(repo.inbound.length, 1);
});

test('inbound STOP (app answers keywords): confirmation names the business, XML-escaped', async () => {
  const { deps } = makeDeps({ smsKeywordReplies: 'app' });
  const res = await handleInboundSms(sms('stop'), deps);
  assert.match(res.twiml!, /<Message>Acme Plumbing &amp; Drain: You've been unsubscribed.*Reply START to resubscribe\.<\/Message>/);
});

test('plain-language opt-out is confirmed by the app even when Twilio handles keywords', async () => {
  const { deps, repo } = makeDeps();
  const res = await handleInboundSms(sms('please stop texting me'), deps);
  assert.ok(repo.optOuts.has(KEY));
  assert.match(res.twiml!, /You've been unsubscribed/);
});

test('carrier-handled opt-out (OptOutType) never gets a second reply', async () => {
  const { deps, repo } = makeDeps({ smsKeywordReplies: 'app' });
  const res = await handleInboundSms(sms('Stop', { OptOutType: 'STOP' }), deps);
  assert.ok(repo.optOuts.has(KEY));
  assert.doesNotMatch(res.twiml!, /<Message>/);
});

test('START clears the opt-out; HELP gives the business line, never the owner cell', async () => {
  const { deps, repo } = makeDeps({ smsKeywordReplies: 'app' });
  await handleInboundSms(sms('STOP'), deps);
  const start = await handleInboundSms(sms('START'), deps);
  assert.equal(repo.optOuts.has(KEY), false);
  assert.match(start.twiml!, /You're subscribed/);

  const help = await handleInboundSms(sms('HELP'), deps);
  assert.match(help.twiml!, new RegExp(`call \\${LINE.twilioPhoneNumber}`));
  assert.doesNotMatch(help.twiml!, new RegExp(`\\${LINE.forwardToNumber}`));
});

test('a redelivered MessageSid is not processed into a second reply', async () => {
  const { deps, repo } = makeDeps({ smsKeywordReplies: 'app' });
  const message = sms('STOP');
  assert.match((await handleInboundSms(message, deps)).twiml!, /<Message>/);
  assert.doesNotMatch((await handleInboundSms(message, deps)).twiml!, /<Message>/);
  assert.equal(repo.inbound.length, 1);
});

test('kill switch suppresses replies but still records the opt-out', async () => {
  const { deps, repo } = makeDeps({ smsKeywordReplies: 'app', killSwitch: true });
  const res = await handleInboundSms(sms('STOP'), deps);
  assert.ok(repo.optOuts.has(KEY));
  assert.doesNotMatch(res.twiml!, /<Message>/);
});

test('ordinary texts are stored for the inbox with no auto-reply; unknown numbers are ignored', async () => {
  const { deps, repo } = makeDeps({ smsKeywordReplies: 'app' });
  const res = await handleInboundSms(sms('Can you come at 3?'), deps);
  assert.doesNotMatch(res.twiml!, /<Message>/);
  assert.equal(repo.inbound[0].body, 'Can you come at 3?');

  const unknown = await handleInboundSms(sms('STOP', { To: '+19995550000' }), deps);
  assert.equal(unknown.status, 200);
  assert.equal(repo.optOuts.size, 0);
});

test('opt-out during a DB outage is buffered and applied by the replay drain (without a late reply)', async () => {
  const lists = new Map<string, string[]>();
  const list = (k: string) => (lists.has(k) ? lists.get(k)! : (lists.set(k, []), lists.get(k)!));
  const store: ReplayListStore = {
    lmove: async (src, dst, from, to) => {
      const v = from === 'left' ? list(src).shift() : list(src).pop();
      if (v === undefined) return null;
      if (to === 'left') list(dst).unshift(v);
      else list(dst).push(v);
      return v;
    },
    lrem: async (k, _c, v) => {
      const i = list(k).indexOf(v);
      if (i >= 0) list(k).splice(i, 1);
      return i >= 0 ? 1 : 0;
    },
    lpush: async (k, v) => list(k).unshift(v),
  };
  const { deps, repo, sms: provider } = makeDeps({
    smsKeywordReplies: 'app',
    replayBuffer: { enqueue: async (kind, payload) => void (await store.lpush(replayKeys(kind).queue, JSON.stringify({ payload, enqueuedAt: 't' }))) },
  });
  repo.failWrites = true;
  const res = await handleInboundSms(sms('STOP'), deps);
  assert.equal(res.status, 200);
  assert.equal(list(replayKeys('twilio-inbound-sms').queue).length, 1);

  repo.failWrites = false;
  await drainReplayBuffer(store, telephonyReplayProcessors(deps));
  assert.ok(repo.optOuts.has(KEY));
  assert.equal(provider.sentMessages.length, 0);
});

// ---------------------------------------------------------------------------
// Opt-out engine x missed-call text-back
// ---------------------------------------------------------------------------
test('after STOP the rescue text is blocked; after START it is sent again', async () => {
  const { deps, sms: provider } = makeDeps();
  await handleInboundSms(sms('STOP'), deps);
  await runAll(await handleDialAction({ ...CALL, CallSid: 'CA-a', DialCallStatus: 'canceled' }, 'forward', deps));
  assert.equal(provider.sentMessages.length, 0);

  await handleInboundSms(sms('START'), deps);
  await runAll(await handleDialAction({ ...CALL, CallSid: 'CA-b', DialCallStatus: 'canceled' }, 'forward', deps));
  assert.equal(provider.sentMessages.length, 1);
  assert.equal(provider.sentMessages[0].statusCallback, 'https://app.test/api/sms/status');
});

// ---------------------------------------------------------------------------
// Delivery receipts
// ---------------------------------------------------------------------------
async function sentRescue() {
  const ctx = makeDeps();
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'canceled' }, 'forward', ctx.deps));
  return { ...ctx, sid: ctx.repo.messages[0].messageSid! };
}

test('status: receipts advance the message but never regress a terminal status', async () => {
  const { deps, repo, sid } = await sentRescue();
  assert.equal((await handleSmsStatus({ MessageSid: sid, MessageStatus: 'delivered' }, deps)).status, 204);
  await handleSmsStatus({ MessageSid: sid, MessageStatus: 'sent' }, deps);
  assert.equal(repo.messages[0].status, 'delivered');
});

test('status: error 21610 mirrors Twilio-side opt-out into the registry', async () => {
  const { deps, repo, sid } = await sentRescue();
  await handleSmsStatus({ MessageSid: sid, MessageStatus: 'failed', ErrorCode: '21610', ErrorMessage: 'unsubscribed' }, deps);
  assert.equal(repo.messages[0].status, 'failed');
  assert.equal(repo.messages[0].errorCode, '21610');
  assert.equal(repo.optOutSources.get(KEY), 'api');
});

test('status: unknown statuses are ignored; DB failure is buffered', async () => {
  const { deps, repo, buffered, sid } = await sentRescue();
  assert.equal((await handleSmsStatus({ MessageSid: sid, MessageStatus: 'partially_delivered' }, deps)).status, 204);
  repo.failWrites = true;
  assert.equal((await handleSmsStatus({ MessageSid: sid, MessageStatus: 'delivered' }, deps)).status, 202);
  assert.equal(buffered.at(-1)?.kind, 'twilio-sms-status');
});
