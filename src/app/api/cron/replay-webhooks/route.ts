import { serverEnv } from '@/lib/config/env';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { drainReplayBuffer } from '@/lib/queue/replay-drain';
import { getUpstashRedis, upstashListStore } from '@/lib/queue/replay-buffer';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { getTelephonyDeps } from '@/lib/telephony/deps';
import { telephonyReplayProcessors } from '@/lib/telephony/replay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Leave headroom under maxDuration so an in-flight entry finishes and is acknowledged.
const RUN_BUDGET_MS = 45_000;

// Replays Twilio webhooks buffered in Upstash while Supabase was unreachable.
// Schedule every few minutes from the host's cron (Vercel/Netlify scheduled function, etc.).
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), serverEnv.cronSecret())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const limit = await rateLimiterFallback.limit('cron:replay-webhooks', 10, 60);
  if (!limit.success) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  const redis = getUpstashRedis();
  if (!redis) {
    return Response.json({ skipped: 'replay buffer not configured' });
  }

  try {
    const report = await drainReplayBuffer(upstashListStore(redis), telephonyReplayProcessors(getTelephonyDeps()), {
      deadline: Date.now() + RUN_BUDGET_MS,
    });
    return Response.json({ report });
  } catch (err) {
    // Redis itself failing; entries stay in their lists for the next run.
    console.error(JSON.stringify({ level: 'error', message: 'Replay drain failed', error: String(err) }));
    return Response.json({ error: 'drain_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
