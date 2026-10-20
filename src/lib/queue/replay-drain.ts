// Drains webhook payloads buffered while Supabase was unreachable (DESIGN_NOTES §6).
// Kept free of Redis/Next imports so it can be unit-tested against an in-memory list store.

export interface ReplayListStore {
  // Atomically pops from one end of `source` and pushes onto `destination`; null when empty.
  lmove(source: string, destination: string, from: 'left' | 'right', to: 'left' | 'right'): Promise<string | null>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
}

export interface ReplayEntry {
  payload: Record<string, string>;
  enqueuedAt: string;
  attempts?: number;
  lastError?: string;
}

// done: written (or nothing to write). retry: transient failure, try again next run.
// drop: can never succeed (malformed), park it in the dead-letter list for inspection.
export type ReplayOutcome = 'done' | 'retry' | 'drop';
export type ReplayProcessor = (entry: ReplayEntry) => Promise<ReplayOutcome>;

export interface KindReport {
  recovered: number;
  processed: number;
  retried: number;
  deadLettered: number;
  stoppedEarly: boolean;
}

const KEY_PREFIX = 'bizcomms:replay:';

export function replayKeys(kind: string) {
  const queue = `${KEY_PREFIX}${kind}`;
  return { queue, processing: `${queue}:processing`, dead: `${queue}:dead` };
}

// Producers LPUSH, so the oldest entry sits at the right end. Each entry is moved atomically
// into a processing list while it is worked on, so a crash mid-run never loses it: the next
// run moves leftovers back first. Replays are idempotent (upsert_call_log), so the rare
// double-processing that recovery allows is harmless; losing an event is not.
export async function drainReplayBuffer(
  store: ReplayListStore,
  processors: Record<string, ReplayProcessor>,
  options: { maxItemsPerKind?: number; maxAttempts?: number; deadline?: number; now?: () => number } = {}
): Promise<Record<string, KindReport>> {
  const maxItems = options.maxItemsPerKind ?? 200;
  const maxAttempts = options.maxAttempts ?? 8;
  const now = options.now ?? Date.now;
  const report: Record<string, KindReport> = {};

  for (const [kind, process] of Object.entries(processors)) {
    const keys = replayKeys(kind);
    const kindReport: KindReport = { recovered: 0, processed: 0, retried: 0, deadLettered: 0, stoppedEarly: false };
    report[kind] = kindReport;

    // Orphans from a crashed run go back to the oldest end so they are retried first.
    for (let i = 0; i < maxItems; i++) {
      if ((await store.lmove(keys.processing, keys.queue, 'right', 'right')) === null) break;
      kindReport.recovered++;
    }

    for (let i = 0; i < maxItems; i++) {
      if (options.deadline !== undefined && now() >= options.deadline) {
        kindReport.stoppedEarly = true;
        break;
      }
      const raw = await store.lmove(keys.queue, keys.processing, 'right', 'left');
      if (raw === null) break;

      let entry: ReplayEntry | null = null;
      try {
        entry = JSON.parse(raw) as ReplayEntry;
      } catch {
        // fall through to dead-letter
      }

      let outcome: ReplayOutcome;
      let error: string | undefined;
      if (!entry || typeof entry.payload !== 'object' || entry.payload === null) {
        outcome = 'drop';
        error = 'unparseable entry';
      } else {
        try {
          outcome = await process(entry);
        } catch (err) {
          outcome = 'retry';
          error = String(err);
        }
      }

      // Push the follow-up copy before removing the in-flight one: a crash in between
      // duplicates an idempotent entry instead of dropping it.
      if (outcome === 'done') {
        kindReport.processed++;
      } else {
        const attempts = (entry?.attempts ?? 0) + 1;
        const exhausted = outcome === 'drop' || attempts >= maxAttempts;
        const next = entry
          ? JSON.stringify({ ...entry, attempts, lastError: error ?? entry.lastError })
          : raw;
        await store.lpush(exhausted ? keys.dead : keys.queue, next);
        if (exhausted) kindReport.deadLettered++;
        else kindReport.retried++;
      }
      await store.lrem(keys.processing, 1, raw);

      // A transient failure almost always means the database is still down; stop hammering it.
      if (outcome === 'retry') {
        kindReport.stoppedEarly = true;
        break;
      }
    }
  }

  return report;
}
