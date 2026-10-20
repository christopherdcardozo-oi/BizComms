import { serverEnv } from '@/lib/config/env';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { syncOrganizationReviews, type SyncReport } from '@/lib/reviews/engine';
import { getReviewEngineDeps } from '@/lib/reviews/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RUN_BUDGET_MS = 45_000;

// Syncs Google reviews for every connected organization, least-recently-synced first, until the
// time budget runs out (the rest continue next run). Schedule every 15-60 minutes.
async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), serverEnv.cronSecret())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limit = await rateLimiterFallback.limit('cron:review-sync', 10, 60);
  if (!limit.success) return Response.json({ error: 'rate_limited' }, { status: 429 });

  const deadline = Date.now() + RUN_BUDGET_MS;
  const deps = getReviewEngineDeps();
  const results: Record<string, SyncReport | { error: string }> = {};
  for (const organizationId of await deps.store.listConnectedOrganizations()) {
    if (Date.now() >= deadline) break;
    try {
      results[organizationId] = await syncOrganizationReviews(organizationId, deps);
    } catch (err) {
      // One org's broken Google connection must not stop the others.
      deps.logger.error('Review sync failed for organization', { organizationId, error: String(err) });
      results[organizationId] = { error: 'sync_failed' };
    }
  }
  return Response.json({ results });
}

export const GET = handle;
export const POST = handle;
