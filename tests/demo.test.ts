// Demo data integrity: fictional-only phone numbers, disclosures, honest review drafts, stable ids.
// Run with: npx sucrase-node tests/demo.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactOf, groupConversations } from '../src/lib/dashboard/conversations';
import { buildDemoData, DEMO_BUSINESS } from '../src/lib/demo/data';

const NOW = new Date('2026-10-20T20:00:00Z');

function allText(data: ReturnType<typeof buildDemoData>): string {
  return JSON.stringify([data.calls, data.messages, data.reviews]);
}

test('every phone number is in the 555-0100–0199 range reserved for fiction', () => {
  const data = buildDemoData(NOW);
  const e164 = [DEMO_BUSINESS.number, ...data.calls.map((c) => c.from_number), ...data.messages.flatMap((m) => [m.from_number, m.to_number])];
  for (const n of e164) assert.match(n, /^\+15155550(1\d\d)$/, n);
  // Numbers written inside transcripts, summaries, messages and replies too.
  // Standalone numbers only (not digit runs inside ids like 00000000-0000-...).
  const spoken = allText(data).match(/(?<![\d-])\(?\d{3}\)?[ -]?\d{3}-\d{4}(?![\d-])/g) ?? [];
  assert.ok(spoken.length > 0);
  for (const n of spoken) assert.match(n, /555-01\d\d$/, n);
});

test('AI transcripts open with the automated-assistant and recording disclosure', () => {
  const ai = buildDemoData(NOW).calls.filter((c) => c.transcript);
  assert.ok(ai.length >= 3);
  for (const c of ai) assert.match(c.transcript!.split('\n')[0], /automated assistant, and this call may be recorded/);
});

test('review replies follow the reply rules: no incentives, no admitted fault', () => {
  for (const r of buildDemoData(NOW).reviews) {
    if (!r.reply_text) continue;
    assert.doesNotMatch(r.reply_text, /discount|refund|free|coupon|our fault|we were wrong/i, r.reviewer_name);
  }
});

test('inbox: five conversations, the right one needs a reply, the opted-out one ends with STOP', () => {
  const data = buildDemoData(NOW);
  const newestFirst = [...data.messages].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const conversations = groupConversations(newestFirst);
  assert.equal(conversations.length, 5);
  assert.equal(conversations.find((c) => c.contact === '+15155550177')?.awaitingReply, true);
  for (const contact of data.optedOut) {
    const thread = data.messages.filter((m) => contactOf(m) === contact);
    assert.equal(thread.at(-1)?.body, 'STOP');
  }
});

test('calls are newest-first, in the past, and ids are stable across page loads', () => {
  const a = buildDemoData(NOW);
  const b = buildDemoData(new Date(NOW.getTime() + 60_000));
  assert.deepEqual(
    a.calls.map((c) => c.id),
    b.calls.map((c) => c.id)
  );
  assert.equal(new Set(a.calls.map((c) => c.id)).size, a.calls.length);
  const times = a.calls.map((c) => Date.parse(c.started_at!));
  assert.deepEqual(times, [...times].sort((x, y) => y - x));
  assert.ok(times.every((t) => t < NOW.getTime()));
});

test('the demo AI never gives technical advice (it only collects details, like the real prompt)', () => {
  for (const c of buildDemoData(NOW).calls.filter((x) => x.transcript)) {
    const aiLines = c.transcript!.split('\n').filter((l) => l.startsWith('AI: ')).join('\n');
    assert.doesNotMatch(aiLines, /turn(ing)? off|valve|filter|breaker|reset|try (to|checking)|you (can|should) (check|turn)/i);
  }
});
