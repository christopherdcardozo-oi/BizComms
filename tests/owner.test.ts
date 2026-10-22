// Owner texting command center: lead alerts to the owner's phone, and the owner's reply commands.
// Run with: npx sucrase-node tests/owner.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiCallAlert, inboundTextAlert, isUrgentSummary, OWNER_ALERT_MAX } from '../src/lib/owner/alerts';
import { MockOwnerCaller } from '../src/lib/owner/caller';
import { parseOwnerCommand, quickReplyText } from '../src/lib/owner/commands';
import type { AlertClaim, LatestLead, OwnerStore } from '../src/lib/owner/types';
import { handleInboundSms } from '../src/lib/sms/handlers';
import { handleDialAction, handleIncomingCall } from '../src/lib/telephony/handlers';
import { handleVapiWebhook } from '../src/lib/voice/webhook';
import { CALL, LINE, makeDeps, runAll, TUESDAY_8PM_CHICAGO } from './support/telephony-fakes';

class FakeOwnerStore implements OwnerStore {
  alerts: Array<AlertClaim & { at: number }> = [];
  jobs: Array<{ contactNumber: string | null; amountCents: number | null }> = [];
  async claimAlert(claim: AlertClaim) {
    if (this.alerts.some((a) => a.organizationId === claim.organizationId && a.dedupeKey === claim.dedupeKey)) return false;
    this.alerts.push({ ...claim, at: this.alerts.length });
    return true;
  }
  async latestLead(org: string): Promise<LatestLead | null> {
    const a = [...this.alerts].reverse().find((x) => x.organizationId === org && x.kind !== 'digest' && x.contactNumber);
    return a ? { kind: a.kind, contactNumber: a.contactNumber!, callSid: a.callSid, urgent: a.urgent } : null;
  }
  async recordJobWon(input: { contactNumber: string | null; amountCents: number | null }) {
    this.jobs.push(input);
  }
  async recoveredCents() {
    return this.jobs.reduce((s, j) => s + (j.amountCents ?? 0), 0);
  }
}

const OWNER = LINE.forwardToNumber;
const CUSTOMER = '+13125550177';
let sid = 0;
const text = (from: string, body: string) => ({ MessageSid: `SMown${++sid}`, From: from, To: LINE.twilioPhoneNumber, Body: body });

function setup(lineOverrides: Partial<typeof LINE> = {}) {
  const store = new FakeOwnerStore();
  const caller = new MockOwnerCaller();
  const ctx = makeDeps({ owner: { store, caller } });
  ctx.repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, ...lineOverrides });
  const toOwner = () => ctx.sms.sentMessages.filter((m) => m.to === OWNER);
  return { ...ctx, store, caller, toOwner };
}

async function missCall(ctx: ReturnType<typeof setup>) {
  await runAll(await handleIncomingCall(CALL, ctx.deps));
  ctx.repo.lines.set(LINE.twilioPhoneNumber, { ...ctx.repo.lines.get(LINE.twilioPhoneNumber)!, aiVoiceEnabled: false });
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', ctx.deps));
}

test('a missed call texts the owner once from the business number, with what to reply', async () => {
  const ctx = setup({ aiVoiceEnabled: false });
  await missCall(ctx);
  const alerts = ctx.toOwner();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].from, LINE.twilioPhoneNumber);
  assert.match(alerts[0].body, /Missed call from \(\d{3}\) \d{3}-\d{4}\. We texted them back\. Reply 1 to call them/);
  assert.equal(ctx.repo.messages.find((m) => m.toNumber === OWNER)?.type, 'system_alert');

  // Twilio redelivers the callback: still one alert.
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', ctx.deps));
  assert.equal(ctx.toOwner().length, 1);
});

test('no owner alert when alerts are off, the owner texted STOP, or billing is inactive', async () => {
  for (const [label, lineOverrides, prep] of [
    ['alerts off', { ownerAlertsEnabled: false }, () => undefined],
    ['owner opted out', {}, (c: ReturnType<typeof setup>) => c.repo.optOuts.add(`${LINE.organizationId}:${OWNER}`)],
    ['billing inactive', { subscriptionStatus: 'canceled' }, () => undefined],
  ] as const) {
    const ctx = setup({ aiVoiceEnabled: false, ...lineOverrides });
    prep(ctx);
    await missCall(ctx);
    assert.equal(ctx.toOwner().length, 0, label);
  }
});

test('a customer text alerts the owner, at most once per 15 minutes per customer', async () => {
  const ctx = setup();
  await runAll(await handleInboundSms(text(CUSTOMER, 'Is this the plumber? Water heater is leaking'), ctx.deps));
  await runAll(await handleInboundSms(text(CUSTOMER, 'Also the basement is wet'), ctx.deps));
  const alerts = ctx.toOwner();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /New text from \(312\) 555-0177: "Is this the plumber\? Water heater is leaking"/);
});

test('an AI call summary is texted to the owner, marked URGENT when the summary says so', async () => {
  const ctx = setup();
  ctx.deps.now = () => TUESDAY_8PM_CHICAGO;
  const res = await handleIncomingCall(CALL, ctx.deps);
  await runAll(res);
  const summary = 'URGENT: Sarah at 412 Elm St has a burst pipe flooding the basement. Callback 312-555-0100.';
  const body = JSON.stringify({
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      call: {
        id: 'vapi-owner-1',
        type: 'inboundPhoneCall',
        phoneNumberId: 'vapi-pn-acme',
        customer: { number: CALL.From },
        startedAt: '2026-10-21T01:00:00Z',
        endedAt: '2026-10-21T01:01:35Z',
        assistantOverrides: { variableValues: { bizcomms_call_sid: CALL.CallSid, bizcomms_org_id: LINE.organizationId } },
      },
      artifact: { transcript: 'AI: Thanks for calling...' },
      analysis: { summary },
    },
  });
  await handleVapiWebhook(new Headers({ authorization: 'Bearer vapi-test-secret' }), body, ctx.deps);
  const alerts = ctx.toOwner();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /^URGENT: AI receptionist took a call from/);
  assert.match(alerts[0].body, /burst pipe/);
  assert.equal(ctx.store.alerts[0].urgent, true);
});

test('owner replies "1": their phone rings and connects to the latest lead with the business caller ID', async () => {
  const ctx = setup();
  await runAll(await handleInboundSms(text(CUSTOMER, 'Need a quote'), ctx.deps));
  const res = await handleInboundSms(text(OWNER, '1'), ctx.deps);
  assert.match(res.twiml!, /Calling you now to connect you with \(312\) 555-0177/);
  assert.deepEqual(ctx.caller.calls[0], {
    ownerNumber: OWNER,
    customerNumber: CUSTOMER,
    businessNumber: LINE.twilioPhoneNumber,
    announce: 'Connecting you to (312) 555-0177.',
  });
});

test('owner replies "2": the lead gets "we\'ll call you back shortly" from the business number', async () => {
  const ctx = setup();
  await runAll(await handleInboundSms(text(CUSTOMER, 'Need a quote'), ctx.deps));
  const res = await handleInboundSms(text(OWNER, '2'), ctx.deps);
  assert.match(res.twiml!, /Texted \(312\) 555-0177/);
  const toCustomer = ctx.sms.sentMessages.filter((m) => m.to === CUSTOMER);
  assert.equal(toCustomer.at(-1)?.body, quickReplyText(LINE.businessName));
});

test('owner replies "won $1,250": the job is logged and the month total comes back', async () => {
  const ctx = setup();
  await runAll(await handleInboundSms(text(CUSTOMER, 'Need a quote'), ctx.deps));
  await handleInboundSms(text(OWNER, 'won 400'), ctx.deps);
  const res = await handleInboundSms(text(OWNER, 'won $1,250'), ctx.deps);
  assert.deepEqual(ctx.store.jobs.at(-1), { organizationId: LINE.organizationId, contactNumber: CUSTOMER, callSid: null, amountCents: 125000 });
  assert.match(res.twiml!, /Logged a \$1,250 job from \(312\) 555-0177\. Recovered this month: \$1,650\./);
});

test("the owner's texts are commands, never customer conversations, and STOP still opts them out", async () => {
  const ctx = setup();
  await handleInboundSms(text(OWNER, '?'), ctx.deps);
  const stored = ctx.repo.inbound.find((m) => m.fromNumber === OWNER);
  assert.equal(stored?.type, 'system_alert');

  const stop = await handleInboundSms(text(OWNER, 'STOP'), ctx.deps);
  assert.doesNotMatch(stop.twiml ?? '', /Reply to a lead alert/);
  assert.equal(await ctx.repo.isOptedOut(LINE.organizationId, OWNER), true);
});

test('commands: parsing, menu, and nothing to act on', async () => {
  assert.deepEqual(parseOwnerCommand(' 1 '), { type: 'call' });
  assert.deepEqual(parseOwnerCommand('CALL'), { type: 'call' });
  assert.deepEqual(parseOwnerCommand('2'), { type: 'quick_reply' });
  assert.deepEqual(parseOwnerCommand('Won $1,200.50'), { type: 'won', amountCents: 120050 });
  assert.deepEqual(parseOwnerCommand('done'), { type: 'won', amountCents: null });
  assert.deepEqual(parseOwnerCommand('?'), { type: 'menu' });
  assert.deepEqual(parseOwnerCommand('hey are you there'), { type: 'unknown' });

  const ctx = setup();
  const none = await handleInboundSms(text(OWNER, '1'), ctx.deps);
  assert.match(none.twiml!, /No new leads in the last 2 days/);
  assert.equal(ctx.caller.calls.length, 0);
});

test('alerts stay within two plain-ASCII SMS segments and keep the reply hint', () => {
  const long = aiCallAlert('+13125550177', 'x'.repeat(2000), false);
  assert.ok(long.length <= OWNER_ALERT_MAX, String(long.length));
  assert.match(long, /Reply 1 to call them back/);
  const txt = inboundTextAlert('+13125550177', 'y'.repeat(2000));
  assert.ok(txt.length <= OWNER_ALERT_MAX);
  assert.match(txt, /Reply 1 to call them/);
  assert.match(long + txt, /^[\x00-\x7F]*$/);
  assert.equal(isUrgentSummary('URGENT: flooding'), true);
  assert.equal(isUrgentSummary('Caller says it is not urgent'), false);
});

test('morning digest: sent once at 7am local time, skipped when there is nothing to report', async () => {
  const { composeDigest, sendMorningDigests } = await import('../src/lib/owner/digest');
  assert.equal(composeDigest({ calls: 0, textedBack: 0, aiCalls: 0, waiting: 0 }, 0), null);
  assert.equal(
    composeDigest({ calls: 6, textedBack: 2, aiCalls: 1, waiting: 3 }, 165000),
    'Good morning. Yesterday: 6 calls, 2 missed and texted back, 1 handled by the AI. 3 customers are waiting for a reply. Recovered this month: $1,650. Reply ? for options.'
  );

  const ctx = setup();
  const digestStore = {
    listAlertLines: async () => [ctx.repo.lines.get(LINE.twilioPhoneNumber)!],
    dayStats: async () => ({ calls: 4, textedBack: 1, aiCalls: 0, waiting: 1 }),
    recoveredCents: async () => 0,
  };
  // 2026-10-22 12:00 UTC is 7:00 in America/Chicago (CDT); 13:00 UTC is 8:00.
  const sevenAm = new Date('2026-10-22T12:00:00Z');
  assert.equal((await sendMorningDigests(new Date('2026-10-22T13:00:00Z'), digestStore, ctx.deps)).sent, 0);
  assert.equal((await sendMorningDigests(sevenAm, digestStore, ctx.deps)).sent, 1);
  assert.equal((await sendMorningDigests(new Date(sevenAm.getTime() + 20 * 60_000), digestStore, ctx.deps)).sent, 0); // same day: once
  assert.match(ctx.toOwner()[0].body, /^Good morning\. Yesterday: 4 calls, 1 missed and texted back\. 1 customer is waiting for a reply\./);
});
