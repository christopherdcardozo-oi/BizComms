import { serverEnv } from '@/lib/config/env';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { releaseLapsedNumbers, resolveGraceDays } from '@/lib/numbers/release';
import { SupabaseReleaseStore } from '@/lib/numbers/supabase-release-store';
import { getNumberProvisioningProvider } from '@/lib/providers/numbers';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Releases Twilio numbers of organizations that stopped paying more than
// NUMBER_RELEASE_GRACE_DAYS (default 30, minimum 7) ago. Schedule once a day.
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), serverEnv.cronSecret())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limit = await rateLimiterFallback.limit('cron:release-lapsed-numbers', 10, 60);
  if (!limit.success) return Response.json({ error: 'rate_limited' }, { status: 429 });

  try {
    const report = await releaseLapsedNumbers({
      provider: getNumberProvisioningProvider(),
      store: new SupabaseReleaseStore(getSupabaseAdmin()),
      now: () => new Date(),
      graceDays: resolveGraceDays(serverEnv.numberReleaseGraceDaysRaw()),
      logger: {
        warn: (message, context) => console.warn(JSON.stringify({ level: 'warn', message, ...context })),
        error: (message, context) => console.error(JSON.stringify({ level: 'error', message, ...context })),
      },
    });
    return Response.json({ report }, { status: report.failed.length > 0 ? 207 : 200 });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Lapsed number release run failed', error: String(err) }));
    return Response.json({ error: 'release_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
