// AI oversight: plain-language call decisions, permissions, the activity feed, and the exact prompts.
// Run with: npx sucrase-node tests/oversight.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDemoOversight } from '../src/lib/demo/oversight';
import { buildFeed, buildPermissions, describeCallDecisions, type CallFacts } from '../src/lib/oversight/model';
import { handleDialAction, handleIncomingCall } from '../src/lib/telephony/handlers';
import { CALL, LINE, makeDeps, runAll } from './support/telephony-fakes';

const base: CallFacts = {
  id: 'c1',
  status: 'completed',
  outcome: null,
  duration_seconds: 0,
  sms_rescued: false,
  sms_rescue_result: null,
  ai_summary: null,
  started_at: '2026-10-22T15:00:00Z',
  created_at: '2026-10-22T15:00:00Z',
  from_number: '+15155550142',
};

test('each call explains what happened in plain language, including why a text was not sent', () => {
  assert.deepEqual(describeCallDecisions({ ...base, outcome: 'answered_by_business', duration_seconds: 272 }), ['Rang your phone.', 'You answered (4m 32s).']);
  assert.deepEqual(describeCallDecisions({ ...base, outcome: 'missed_call_texted', sms_rescued: true, sms_rescue_result: 'sent' }), [
    'Rang your phone. No answer.',
    'Texted the caller back from your business number.',
  ]);
  assert.match(describeCallDecisions({ ...base, outcome: 'caller_abandoned', sms_rescue_result: 'opted_out' }).at(-1)!, /had replied STOP/);
  assert.match(describeCallDecisions({ ...base, outcome: 'caller_abandoned', sms_rescue_result: 'a2p_not_approved' }).at(-1)!, /registration is not approved/);
  const ai = describeCallDecisions({ ...base, outcome: 'ai_conversation_completed', duration_seconds: 95, ai_summary: 'URGENT: burst pipe' });
  assert.match(ai.join(' '), /AI answered and took the details \(1m 35s\)\. Callers are told it is an automated assistant/);
  assert.ok(ai.includes('Marked URGENT from what the caller described.'));
});

test('the text-back decision is saved on the call, and a redelivered callback never overwrites it', async () => {
  const ctx = makeDeps();
  const saved: Array<[string, string]> = [];
  ctx.repo.recordRescueResult = async (callSid: string, _org: string, result: string) => void saved.push([callSid, result]);
  ctx.repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, aiVoiceEnabled: false });
  await runAll(await handleIncomingCall(CALL, ctx.deps));
  ctx.repo.optOuts.add(`${LINE.organizationId}:${CALL.From}`);
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', ctx.deps));
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'no-answer' }, 'forward', ctx.deps));
  assert.deepEqual(saved[0], [CALL.CallSid, 'opted_out']);
});

test('permissions: plan limits show as "not in your plan", hard rules are always "never"', () => {
  const perms = buildPermissions(
    {
      plan: { aiReceptionist: false, reviews: false },
      ringSeconds: 15,
      aiVoiceEnabled: true,
      afterHoursDirectToAi: true,
      missedCallSmsEnabled: true,
      ownerAlertsEnabled: false,
      google: null,
    },
    '/dashboard/settings'
  );
  const state = (label: string) => perms.find((p) => p.label === label)?.state;
  assert.equal(state('Answer calls you miss'), 'not_in_plan');
  assert.equal(state('Text back callers you miss'), 'on');
  assert.equal(state('Text you about new leads'), 'off');
  assert.equal(state('Draft replies to Google reviews'), 'not_in_plan');
  assert.equal(state('Book appointments on your calendar'), 'coming_soon');
  for (const rule of ['Quote prices', 'Promise appointment or arrival times', 'Give repair or technical advice', 'Text people who never contacted you']) {
    assert.equal(state(rule), 'never', rule);
  }
});

test('the activity feed merges calls, alerts and reviews newest first, linking calls to their detail page', () => {
  const feed = buildFeed({
    calls: [{ ...base, outcome: 'missed_call_texted', sms_rescued: true, started_at: '2026-10-22T10:00:00Z' }],
    alerts: [{ kind: 'missed_call', created_at: '2026-10-22T10:01:00Z', urgent: false }],
    reviews: [{ id: 'r1', reviewer_name: 'Kevin L.', star_rating: 2, reply_status: 'manual_review', ai_model: 'gpt-4o-mini', review_created_at: '2026-10-22T09:00:00Z', reply_published_at: null }],
    formatNumber: (n) => n,
    callHref: (id) => `/dashboard/calls/${id}`,
    reviewsHref: '/dashboard/reviews',
  });
  assert.deepEqual(
    feed.map((f) => f.kind),
    ['alert', 'call', 'review']
  );
  assert.equal(feed[1].href, '/dashboard/calls/c1');
  assert.match(feed[2].steps.join(' '), /Waiting for your approval/);
});

test('the demo oversight page shows the real prompts, with the built-in rules and no repair advice', () => {
  const demo = buildDemoOversight(new Date('2026-10-22T20:00:00Z'));
  const receptionist = demo.prompts.find((p) => p.title === 'AI receptionist: instructions')!.body;
  assert.match(receptionist, /Never quote prices, promise appointment times, or give technical, medical, or legal advice/);
  assert.match(receptionist, /Service area: Ames, Ankeny, Nevada and Boone/);
  assert.doesNotMatch(receptionist, /valve|breaker/i);
  assert.ok(demo.prompts.some((p) => p.title === 'Google review replies: instructions' && /Never offer discounts/.test(p.body)));
  assert.ok(demo.feed.length > 0);
});
