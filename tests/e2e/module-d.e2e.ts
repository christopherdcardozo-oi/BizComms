// End-to-end test of Module D (Google review replies) against a REAL Supabase project: real server,
// real cron auth, encrypted Google tokens, the claim RPC and every row written. Google and the
// LLM are the built-in mocks (Google API access needs approval), so no external calls are made.
//
// Run:  npx sucrase-node tests/e2e/module-d.e2e.ts --i-understand-this-writes-to-supabase
import type { ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { encryptToken } from '../../src/lib/crypto/token-cipher';
import { BASE, check, connectTestDatabase, failureCount, loadEnvLocal, startServer } from './harness';

const CRON_SECRET = 'e2e-cron-secret';

async function runSync() {
  const res = await fetch(`${BASE}/api/cron/review-sync`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { results?: Record<string, Record<string, unknown>> } };
}

async function main() {
  const db = connectTestDatabase();
  const key = process.env.TOKEN_ENCRYPTION_KEY ?? loadEnvLocal().TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY missing from .env.local');
  const run = randomInt(100000, 999999);

  // The mock Google returns the same review ids for everyone; make sure no other org holds them.
  const { count: clashes } = await db.from('reviews').select('id', { count: 'exact', head: true }).in('google_review_id', ['mock-rev-001', 'mock-rev-002']);
  if (clashes) throw new Error('Another organization already holds the mock review ids; disconnect its mock Google first.');

  const { data: org, error } = await db
    .from('organizations')
    .insert({ name: 'E2E Review Plumbing', slug: `e2e-rev-${run}`, subscription_status: 'active', stripe_subscription_id: 'sub_e2e_rev' })
    .select('id')
    .single();
  if (error || !org) throw new Error(`Seeding organization failed: ${error?.message}`);
  const orgId = (org as { id: string }).id;
  console.log(`Seeded test organization ${orgId}\n`);

  let server: ChildProcess | null = null;
  try {
    const seeded = await Promise.all([
      db.from('google_configs').insert({
        organization_id: orgId,
        google_account_id: 'accounts/mock-1',
        google_location_id: 'locations/mock-1',
        location_name: 'E2E Review Plumbing (Google)',
        auto_reply_enabled: true,
        auto_reply_min_stars: 1,
        auto_publish_min_stars: 4,
      }),
      db.from('google_tokens').insert({
        organization_id: orgId,
        encrypted_refresh_token: encryptToken('mock-refresh', key),
        encrypted_access_token: encryptToken('mock-access', key),
        token_expires_at: new Date(Date.now() - 60_000).toISOString(), // expired: forces a refresh
      }),
    ]);
    for (const r of seeded) if (r.error) throw new Error(`Seeding failed: ${r.error.message}`);

    server = await startServer({
      USE_MOCK_GOOGLE_REVIEWS: 'true',
      LLM_PROVIDER: 'mock',
      CRON_SECRET,
      NEXT_TELEMETRY_DISABLED: '1',
    });

    console.log('1. Cron security');
    const denied = await fetch(`${BASE}/api/cron/review-sync`, { headers: { authorization: 'Bearer wrong' } });
    check('sync without the cron secret is rejected (401)', denied.status === 401, denied.status);

    console.log('2. First sync');
    const first = await runSync();
    const r1 = first.body.results?.[orgId];
    check('sync imported 2, drafted 2, auto-published 1', first.status === 200 && r1?.imported === 2 && r1?.drafted === 2 && r1?.published === 1, first.body);

    const reviews = ((await db.from('reviews').select('*').eq('organization_id', orgId)).data ?? []) as Array<Record<string, unknown>>;
    const five = reviews.find((r) => r.google_review_id === 'mock-rev-001');
    const two = reviews.find((r) => r.google_review_id === 'mock-rev-002');
    check('5-star review: published with an AI reply and model recorded', five?.reply_status === 'published' && !!five?.reply_text && !!five?.reply_published_at && !!five?.ai_model, five);
    check('2-star review: waiting for approval with an AI draft', two?.reply_status === 'manual_review' && String(two?.reply_text).startsWith('Hello Marcus,'), two);
    check('sentiment recorded', five?.sentiment === 'positive' && two?.sentiment === 'negative', { five: five?.sentiment, two: two?.sentiment });

    const tokens = (await db.from('google_tokens').select('encrypted_access_token, token_expires_at').eq('organization_id', orgId).single()).data as {
      encrypted_access_token: string;
      token_expires_at: string;
    };
    check('expired access token was refreshed and stored encrypted', Date.parse(tokens.token_expires_at) > Date.now() && tokens.encrypted_access_token.startsWith('v1.') && !tokens.encrypted_access_token.includes('mock-access'), tokens.token_expires_at);
    const cfg = (await db.from('google_configs').select('last_synced_at').eq('organization_id', orgId).single()).data as { last_synced_at: string | null };
    check('last_synced_at updated', !!cfg.last_synced_at);

    console.log('3. Second sync (idempotency)');
    const second = await runSync();
    const r2 = second.body.results?.[orgId];
    check('second sync imports and drafts nothing new', r2?.imported === 0 && r2?.drafted === 0 && r2?.published === 0, second.body);
    const count = (await db.from('reviews').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)).count;
    check('still exactly 2 review rows', count === 2, count);

    console.log('4. Usage');
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const usage = (await db.from('usage_records').select('ai_review_replies_generated').eq('organization_id', orgId).eq('billing_period_start', monthStart).maybeSingle()).data as {
      ai_review_replies_generated: number;
    } | null;
    check('2 AI review replies metered', usage?.ai_review_replies_generated === 2, usage);
  } finally {
    server?.kill('SIGTERM');
    await db.from('organizations').delete().eq('id', orgId); // cascades to configs, tokens, reviews, usage
    console.log(`\nCleaned up test organization ${orgId}.`);
  }

  const failures = failureCount();
  console.log(failures === 0 ? '\nE2E PASSED' : `\nE2E FAILED: ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
