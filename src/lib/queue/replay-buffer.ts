import 'server-only';
import { Redis } from '@upstash/redis';
import { serverEnv } from '../config/env';
import type { ReplayBuffer } from '../telephony/types';
import { replayKeys, type ReplayEntry, type ReplayListStore } from './replay-drain';

// Upstash list per webhook kind; /api/cron/replay-webhooks drains entries once Supabase is reachable.
export class UpstashReplayBuffer implements ReplayBuffer {
  constructor(private redis: Redis) {}

  async enqueue(kind: string, payload: Record<string, string>): Promise<void> {
    const entry: ReplayEntry = { payload, enqueuedAt: new Date().toISOString() };
    await this.redis.lpush(replayKeys(kind).queue, JSON.stringify(entry));
  }
}

// Values must round-trip as the exact strings we pushed so the drain can LREM them,
// so Upstash's automatic JSON deserialization is turned off.
export function getUpstashRedis(): Redis | null {
  const url = serverEnv.upstashUrl();
  const token = serverEnv.upstashToken();
  if (!url || !token) return null;
  return new Redis({ url, token, automaticDeserialization: false });
}

export function getReplayBuffer(): ReplayBuffer | null {
  const redis = getUpstashRedis();
  return redis ? new UpstashReplayBuffer(redis) : null;
}

export function upstashListStore(redis: Redis): ReplayListStore {
  return {
    lmove: (source, destination, from, to) => redis.lmove<string | null>(source, destination, from, to),
    lrem: (key, count, value) => redis.lrem(key, count, value),
    lpush: (key, value) => redis.lpush(key, value),
  };
}
