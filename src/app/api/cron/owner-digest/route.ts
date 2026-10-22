import { serverEnv } from '@/lib/config/env';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { sendMorningDigests } from '@/lib/owner/digest';
import { SupabaseDigestStore } from '@/lib/owner/supabase-store';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getTelephonyDeps } from '@/lib/telephony/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Texts each business owner a summary at 7am in their own time zone. Schedule hourly, on the hour;
// running it more often is safe (each business gets at most one digest per local day).
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), serverEnv.cronSecret())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limit = await rateLimiterFallback.limit('cron:owner-digest', 10, 60);
  if (!limit.success) return Response.json({ error: 'rate_limited' }, { status: 429 });

  try {
    const report = await sendMorningDigests(new Date(), new SupabaseDigestStore(getSupabaseAdmin()), getTelephonyDeps());
    return Response.json({ report }, { status: report.failed > 0 ? 207 : 200 });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Owner digest run failed', error: String(err) }));
    return Response.json({ error: 'digest_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
