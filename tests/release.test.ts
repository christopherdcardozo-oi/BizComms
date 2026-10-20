// Lapsed-number release tests. Run with: npx sucrase-node tests/release.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  releaseDate,
  releaseLapsedNumbers,
  resolveGraceDays,
  type LapsedLine,
  type ReleaseStore,
} from '../src/lib/numbers/release';

const NOW = new Date('2026-12-01T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

interface Org {
  status: string;
  changedAt: string;
}

class FakeReleaseStore implements ReleaseStore {
  orgs = new Map<string, Org>();
  lines = new Map<string, LapsedLine>();
  failDelete = false;
  // Simulates a customer resubscribing between the query and the release.
  onAfterFind?: () => void;

  addLine(id: string, org: Org, sid: string | null = `PN_${id}`) {
    this.orgs.set(`org-${id}`, org);
    this.lines.set(`cfg-${id}`, { configId: `cfg-${id}`, organizationId: `org-${id}`, twilioPhoneNumber: `+1312555${id.padStart(4, '0')}`, twilioPhoneSid: sid });
  }
  private lapsed(orgId: string, statuses: readonly string[], before: string) {
    const org = this.orgs.get(orgId);
    return !!org && statuses.includes(org.status) && org.changedAt < before;
  }
  async findLapsedLines(statuses: readonly string[], before: string, limit: number) {
    const found = [...this.lines.values()].filter((l) => this.lapsed(l.organizationId, statuses, before)).slice(0, limit);
    this.onAfterFind?.();
    return found;
  }
  async isStillLapsed(orgId: string, statuses: readonly string[], before: string) {
    return this.lapsed(orgId, statuses, before);
  }
  async deleteLine(configId: string) {
    if (this.failDelete) throw new Error('db down');
    this.lines.delete(configId);
  }
}

class FakeTwilio {
  owned = new Set<string>();
  failWith: number | null = null;
  async release(sid: string) {
    if (this.failWith) throw Object.assign(new Error(`twilio ${this.failWith}`), { status: this.failWith });
    if (!this.owned.has(sid)) throw Object.assign(new Error('not found'), { status: 404 });
    this.owned.delete(sid);
  }
}

function setup() {
  const store = new FakeReleaseStore();
  const twilio = new FakeTwilio();
  const logs: string[] = [];
  const run = () =>
    releaseLapsedNumbers({
      provider: twilio,
      store,
      now: () => NOW,
      graceDays: 30,
      logger: { warn: (m) => void logs.push(m), error: (m) => void logs.push(m) },
    });
  const add = (id: string, org: Org, sid?: string | null) => {
    store.addLine(id, org, sid === undefined ? `PN_${id}` : sid);
    if (sid !== null) twilio.owned.add(sid ?? `PN_${id}`);
  };
  return { store, twilio, run, add, logs };
}

test('grace days: default 30, never below 7, garbage falls back to default', () => {
  assert.equal(resolveGraceDays(undefined), 30);
  assert.equal(resolveGraceDays('45'), 45);
  assert.equal(resolveGraceDays('0'), 7);
  assert.equal(resolveGraceDays('-5'), 7);
  assert.equal(resolveGraceDays('soon'), 30);
  assert.equal(releaseDate('2026-11-01T00:00:00Z', 30).toISOString(), '2026-12-01T00:00:00.000Z');
});

test('releases numbers lapsed past the grace period, and only those', async () => {
  const { store, twilio, run, add } = setup();
  add('1', { status: 'canceled', changedAt: daysAgo(31) });
  add('2', { status: 'unpaid', changedAt: daysAgo(45) });
  add('3', { status: 'canceled', changedAt: daysAgo(10) }); // still in grace
  add('4', { status: 'past_due', changedAt: daysAgo(90) }); // Stripe still retrying
  add('5', { status: 'active', changedAt: daysAgo(400) });

  const report = await run();
  assert.deepEqual(report.released.sort(), ['+13125550001', '+13125550002']);
  assert.deepEqual([...store.lines.keys()].sort(), ['cfg-3', 'cfg-4', 'cfg-5']);
  assert.deepEqual([...twilio.owned].sort(), ['PN_3', 'PN_4', 'PN_5']);
});

test('a customer who resubscribes mid-run keeps their number', async () => {
  const { store, twilio, run, add } = setup();
  add('1', { status: 'canceled', changedAt: daysAgo(60) });
  store.onAfterFind = () => store.orgs.set('org-1', { status: 'active', changedAt: NOW.toISOString() });
  const report = await run();
  assert.deepEqual(report.skipped, [{ phoneNumber: '+13125550001', reason: 'resubscribed' }]);
  assert.ok(twilio.owned.has('PN_1'));
  assert.ok(store.lines.has('cfg-1'));
});

test('Twilio failure keeps the line so nothing is silently lost', async () => {
  const { store, twilio, run, add } = setup();
  add('1', { status: 'canceled', changedAt: daysAgo(60) });
  twilio.failWith = 503;
  const report = await run();
  assert.deepEqual(report.failed, [{ phoneNumber: '+13125550001', reason: 'release_failed' }]);
  assert.ok(store.lines.has('cfg-1'));
});

test('row delete failure after release self-heals on the next run (Twilio 404 = already gone)', async () => {
  const { store, twilio, run, add } = setup();
  add('1', { status: 'canceled', changedAt: daysAgo(60) });
  store.failDelete = true;
  const first = await run();
  assert.deepEqual(first.failed, [{ phoneNumber: '+13125550001', reason: 'delete_failed' }]);
  assert.equal(twilio.owned.has('PN_1'), false, 'number already released at Twilio');

  store.failDelete = false;
  const second = await run();
  assert.deepEqual(second.released, ['+13125550001']);
  assert.equal(store.lines.size, 0);
});

test('lines without a Twilio SID are left for manual release', async () => {
  const { store, run, add, logs } = setup();
  add('1', { status: 'canceled', changedAt: daysAgo(60) }, null);
  const report = await run();
  assert.deepEqual(report.skipped, [{ phoneNumber: '+13125550001', reason: 'missing_sid' }]);
  assert.ok(store.lines.has('cfg-1'));
  assert.ok(logs.some((m) => /manually/.test(m)));
});
