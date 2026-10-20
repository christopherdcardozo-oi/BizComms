// Replay-buffer drain tests: list semantics, retry/dead-letter, crash recovery, the
// telephony replay processors and CRON_SECRET auth. Run with: npx sucrase-node tests/replay.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthorizedCronRequest } from '../src/lib/cron/auth';
import {
  drainReplayBuffer,
  replayKeys,
  type ReplayEntry,
  type ReplayListStore,
  type ReplayProcessor,
} from '../src/lib/queue/replay-drain';
import { handleCallStatus, handleDialAction } from '../src/lib/telephony/handlers';
import { telephonyReplayProcessors } from '../src/lib/telephony/replay';
import type { ReplayBuffer } from '../src/lib/telephony/types';
import { CALL, makeDeps } from './support/telephony-fakes';

// Redis list semantics: "left" is index 0. Producers LPUSH, so the oldest entry is rightmost.
class FakeListStore implements ReplayListStore {
  lists = new Map<string, string[]>();
  list(key: string) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    return this.lists.get(key)!;
  }
  async lmove(source: string, destination: string, from: 'left' | 'right', to: 'left' | 'right') {
    const src = this.list(source);
    if (src.length === 0) return null;
    const value = from === 'left' ? src.shift()! : src.pop()!;
    if (to === 'left') this.list(destination).unshift(value);
    else this.list(destination).push(value);
    return value;
  }
  async lrem(key: string, count: number, value: string) {
    const list = this.list(key);
    let removed = 0;
    for (let i = 0; i < list.length && removed < count; ) {
      if (list[i] === value) {
        list.splice(i, 1);
        removed++;
      } else i++;
    }
    return removed;
  }
  async lpush(key: string, value: string) {
    return this.list(key).unshift(value);
  }
}

// Mirrors UpstashReplayBuffer (which is server-only) on top of the fake store.
function fakeBuffer(store: FakeListStore): ReplayBuffer {
  return {
    enqueue: async (kind, payload) =>
      void (await store.lpush(replayKeys(kind).queue, JSON.stringify({ payload, enqueuedAt: '2026-10-20T00:00:00Z' }))),
  };
}

function seed(store: FakeListStore, kind: string, ids: string[]) {
  for (const id of ids) {
    store.list(replayKeys(kind).queue).unshift(JSON.stringify({ payload: { id }, enqueuedAt: 't' } satisfies ReplayEntry));
  }
}

const parsed = (store: FakeListStore, key: string) => store.list(key).map((raw) => JSON.parse(raw) as ReplayEntry);

// ---------------------------------------------------------------------------
// Drain mechanics
// ---------------------------------------------------------------------------
test('drain: processes oldest first and acknowledges every entry', async () => {
  const store = new FakeListStore();
  seed(store, 'k', ['a', 'b', 'c']);
  const seen: string[] = [];
  const report = await drainReplayBuffer(store, { k: async (e) => (seen.push(e.payload.id), 'done') });
  assert.deepEqual(seen, ['a', 'b', 'c']);
  assert.equal(report.k.processed, 3);
  assert.equal(store.list(replayKeys('k').queue).length, 0);
  assert.equal(store.list(replayKeys('k').processing).length, 0);
});

test('drain: transient failure requeues with attempts+1, stops the kind, leaves nothing in flight', async () => {
  const store = new FakeListStore();
  seed(store, 'k', ['a', 'b']);
  let calls = 0;
  const report = await drainReplayBuffer(store, {
    k: async () => {
      calls++;
      throw new Error('db down');
    },
  });
  assert.equal(calls, 1, 'stops after the first transient failure');
  assert.equal(report.k.retried, 1);
  assert.equal(report.k.stoppedEarly, true);
  const queue = parsed(store, replayKeys('k').queue);
  assert.deepEqual(queue.map((e) => e.payload.id), ['a', 'b'], 'retried entry goes to the back (left)');
  assert.equal(queue[0].attempts, 1);
  assert.match(queue[0].lastError!, /db down/);
  assert.equal(store.list(replayKeys('k').processing).length, 0);
});

test('drain: entry is dead-lettered after maxAttempts', async () => {
  const store = new FakeListStore();
  seed(store, 'k', ['a']);
  const failing: ReplayProcessor = async () => 'retry';
  for (let run = 0; run < 3; run++) await drainReplayBuffer(store, { k: failing }, { maxAttempts: 3 });
  assert.equal(store.list(replayKeys('k').queue).length, 0);
  const dead = parsed(store, replayKeys('k').dead);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].attempts, 3);
});

test('drain: drop outcomes and unparseable entries go straight to dead-letter', async () => {
  const store = new FakeListStore();
  store.list(replayKeys('k').queue).unshift('{not json');
  seed(store, 'k', ['bad']);
  const report = await drainReplayBuffer(store, { k: async () => 'drop' });
  assert.equal(report.k.deadLettered, 2);
  assert.equal(store.list(replayKeys('k').dead).length, 2);
  assert.ok(store.list(replayKeys('k').dead).includes('{not json'));
});

test('drain: entries orphaned in processing by a crashed run are recovered and processed first', async () => {
  const store = new FakeListStore();
  seed(store, 'k', ['new']);
  store.list(replayKeys('k').processing).push(JSON.stringify({ payload: { id: 'orphan' }, enqueuedAt: 't' }));
  const seen: string[] = [];
  const report = await drainReplayBuffer(store, { k: async (e) => (seen.push(e.payload.id), 'done') });
  assert.equal(report.k.recovered, 1);
  assert.deepEqual(seen, ['orphan', 'new']);
});

test('drain: deadline leaves remaining entries queued for the next run', async () => {
  const store = new FakeListStore();
  seed(store, 'k', ['a', 'b', 'c']);
  let clock = 0;
  const report = await drainReplayBuffer(
    store,
    { k: async () => ((clock += 10), 'done') },
    { deadline: 15, now: () => clock }
  );
  assert.equal(report.k.processed, 2);
  assert.equal(report.k.stoppedEarly, true);
  assert.equal(store.list(replayKeys('k').queue).length, 1);
});

// ---------------------------------------------------------------------------
// Telephony processors, end to end through the buffer
// ---------------------------------------------------------------------------
test('replay: status callback buffered during an outage is written once the DB is back', async () => {
  const store = new FakeListStore();
  const { deps, repo } = makeDeps({ replayBuffer: fakeBuffer(store) });
  repo.failWrites = true;
  const params = { ...CALL, CallStatus: 'completed', CallDuration: '61' };
  assert.equal((await handleCallStatus(params, deps)).status, 202);

  // Still down: the drain must requeue, not re-buffer a second copy.
  await drainReplayBuffer(store, telephonyReplayProcessors(deps));
  assert.equal(store.list(replayKeys('twilio-call-status').queue).length, 1);

  repo.failWrites = false;
  const report = await drainReplayBuffer(store, telephonyReplayProcessors(deps));
  assert.equal(report['twilio-call-status'].processed, 1);
  assert.equal(repo.callLogs.get('CA100')?.status, 'completed');
  assert.equal(repo.callLogs.get('CA100')?.durationSeconds, 61);
  assert.equal(store.list(replayKeys('twilio-call-status').queue).length, 0);
});

test('replay: dial action records the outcome but never sends a late rescue SMS', async () => {
  const store = new FakeListStore();
  const { deps, repo, sms } = makeDeps({ replayBuffer: fakeBuffer(store) });
  repo.failLookups = true;
  await handleDialAction({ ...CALL, DialCallStatus: 'canceled', DialCallSid: 'CA300' }, 'forward', deps).then(
    (res) => res.background?.()
  );
  assert.equal(store.list(replayKeys('twilio-dial-action').queue).length, 1);

  repo.failLookups = false;
  await drainReplayBuffer(store, telephonyReplayProcessors(deps));
  assert.equal(repo.callLogs.get('CA100')?.outcome, 'caller_abandoned');
  assert.equal(repo.callLogs.get('CA100')?.childCallSid, 'CA300');
  assert.equal(sms.sentMessages.length, 0);
});

test('replay: malformed dial action payload is dead-lettered', async () => {
  const store = new FakeListStore();
  const { deps } = makeDeps();
  store.lpush(replayKeys('twilio-dial-action').queue, JSON.stringify({ payload: { ...CALL, leg: 'sideways' }, enqueuedAt: 't' }));
  const report = await drainReplayBuffer(store, telephonyReplayProcessors(deps));
  assert.equal(report['twilio-dial-action'].deadLettered, 1);
});

// ---------------------------------------------------------------------------
// Cron auth
// ---------------------------------------------------------------------------
test('cron auth: exact bearer secret only, fails closed without a configured secret', () => {
  assert.equal(isAuthorizedCronRequest('Bearer s3cret', 's3cret'), true);
  assert.equal(isAuthorizedCronRequest('Bearer s3cre', 's3cret'), false);
  assert.equal(isAuthorizedCronRequest('Bearer s3cret-and-more', 's3cret'), false);
  assert.equal(isAuthorizedCronRequest('s3cret', 's3cret'), false);
  assert.equal(isAuthorizedCronRequest(null, 's3cret'), false);
  assert.equal(isAuthorizedCronRequest('Bearer ', undefined), false);
  assert.equal(isAuthorizedCronRequest('Bearer anything', undefined), false);
});
