// Module D tests: token encryption, OAuth state, reply prompt/parsing, the Google v4 provider
// against a simulated API, and the sync/approve engine rules.
// Run with: npx sucrase-node tests/reviews.test.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decryptToken, encryptToken } from '../src/lib/crypto/token-cipher';
import { createOAuthState, verifyOAuthState } from '../src/lib/google/oauth-state';
import { getLlmProvider } from '../src/lib/providers/llm';
import { MockLlmProvider } from '../src/lib/providers/llm/mock';
import { parseReplyJson, reviewReplyPrompt } from '../src/lib/providers/llm/prompt';
import type { ILlmProvider } from '../src/lib/providers/llm/types';
import { GoogleReviewsProvider } from '../src/lib/providers/reviews/google';
import { MockReviewsProvider } from '../src/lib/providers/reviews/mock';
import {
  publishApprovedReply,
  syncOrganizationReviews,
  type ClaimedReview,
  type NewReviewRow,
  type ReviewConfig,
  type ReviewEngineDeps,
  type ReviewPatch,
  type ReviewStore,
  type StoredTokens,
} from '../src/lib/reviews/engine';

const KEY = randomBytes(32).toString('base64');

// ---------------------------------------------------------------------------
// Crypto + OAuth state
// ---------------------------------------------------------------------------
test('token cipher: round-trips, is randomized, and rejects tampering or the wrong key', () => {
  const sealed = encryptToken('refresh-token-123', KEY);
  assert.notEqual(sealed, encryptToken('refresh-token-123', KEY), 'fresh IV each time');
  assert.equal(decryptToken(sealed, KEY), 'refresh-token-123');
  const [v, iv, tag, ct] = sealed.split('.');
  const flipped = ct.slice(0, -2) + (ct.endsWith('A') ? 'B' : 'A') + ct.slice(-1);
  assert.throws(() => decryptToken([v, iv, tag, flipped].join('.'), KEY));
  assert.throws(() => decryptToken(sealed, randomBytes(32).toString('base64')));
  assert.throws(() => encryptToken('x', 'too-short'), /32 bytes/);
});

test('OAuth state: valid only with the matching cookie, untampered, and unexpired', () => {
  const state = createOAuthState('org-1', 'secret', 1_000);
  assert.equal(verifyOAuthState(state, state, 'secret', 2_000)?.organizationId, 'org-1');
  assert.equal(verifyOAuthState(state, undefined, 'secret', 2_000), null, 'no cookie (CSRF)');
  assert.equal(verifyOAuthState(state, createOAuthState('org-1', 'secret', 1_000), 'secret', 2_000), null, 'different browser');
  assert.equal(verifyOAuthState(state, state, 'other-secret', 2_000), null, 'forged signature');
  assert.equal(verifyOAuthState(state, state, 'secret', 1_000 + 11 * 60_000), null, 'expired');
  const [body, sig] = state.split('.');
  const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), organizationId: 'org-2' })).toString('base64url');
  assert.equal(verifyOAuthState(`${evil}.${sig}`, `${evil}.${sig}`, 'secret', 2_000), null, 'org swap');
});

// ---------------------------------------------------------------------------
// Prompt + parsing + provider selection
// ---------------------------------------------------------------------------
test('prompt carries the safety rules and owner instructions', () => {
  const { system, user } = reviewReplyPrompt({
    businessName: 'Acme',
    reviewerName: 'Jane Doe',
    starRating: 1,
    reviewComment: 'Late!',
    customInstructions: 'Invite them to call (515) 555-0100.',
  });
  assert.match(system, /without admitting fault or liability/);
  assert.match(system, /Never offer discounts, refunds, gifts, or incentives/);
  assert.match(system, /Invite them to call \(515\) 555-0100\./);
  assert.match(user, /Stars: 1 of 5/);
});

test('reply parsing: tolerant of wrapping, strict about empty replies, caps length', () => {
  assert.deepEqual(parseReplyJson('```json\n{"reply":"\\"Thanks Jane!\\"","sentiment":"positive"}\n```', 5), { reply: 'Thanks Jane!', sentiment: 'positive' });
  assert.equal(parseReplyJson('{"reply":"Hi","sentiment":"furious"}', 2).sentiment, 'negative', 'falls back to stars');
  assert.throws(() => parseReplyJson('{"reply":"  "}', 5), /empty/);
  assert.throws(() => parseReplyJson('no json here', 5), /valid JSON/);
  assert.equal(parseReplyJson(JSON.stringify({ reply: 'x'.repeat(5000), sentiment: 'neutral' }), 3).reply.length, 1000);
});

test('Gemini is refused unless the paid tier is explicitly confirmed', () => {
  const saved = { ...process.env };
  try {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'k';
    delete process.env.GEMINI_PAID_TIER_CONFIRMED;
    assert.throws(() => getLlmProvider(), /free tier may train/);
    process.env.GEMINI_PAID_TIER_CONFIRMED = 'true';
    assert.ok(getLlmProvider());
  } finally {
    process.env = saved;
  }
});

// ---------------------------------------------------------------------------
// Google v4 provider against a simulated API
// ---------------------------------------------------------------------------
test('Google provider: maps v4 star strings, anonymous reviewers, pages; PUTs replies to the v4 path', async () => {
  const calls: Array<{ url: string; method: string; body?: string; auth?: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined, auth: (init?.headers as Record<string, string>)?.Authorization });
    if (url.includes('/reviews?') && !url.includes('pageToken')) {
      return Response.json({
        reviews: [
          { reviewId: 'r1', reviewer: { displayName: 'Jane Doe' }, starRating: 'FOUR', comment: 'Great', createTime: '2026-10-01T00:00:00Z', updateTime: '2026-10-01T00:00:00Z' },
          { reviewId: 'r0', reviewer: { isAnonymous: true }, starRating: 'STAR_RATING_UNSPECIFIED', createTime: '2026-10-01T00:00:00Z', updateTime: '2026-10-01T00:00:00Z' },
        ],
        nextPageToken: 'p2',
      });
    }
    if (url.includes('pageToken=p2')) {
      return Response.json({
        reviews: [{ reviewId: 'r2', reviewer: { isAnonymous: true, displayName: 'Hidden' }, starRating: 'ONE', createTime: '2026-10-02T00:00:00Z', updateTime: '2026-10-02T00:00:00Z', reviewReply: { comment: 'Sorry!', updateTime: '2026-10-03T00:00:00Z' } }],
      });
    }
    if (url.endsWith('/reviews/r1/reply')) return new Response('{}', { status: 200 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  try {
    const provider = new GoogleReviewsProvider({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost:3000/api/auth/google/callback' });
    const reviews = await provider.listReviews({ accountId: 'accounts/1', locationId: 'locations/2', accessToken: 'tok' });
    assert.deepEqual(
      reviews.map((r) => [r.reviewId, r.starRating, r.reviewerName, r.reviewReply?.comment ?? null]),
      [
        ['r1', 4, 'Jane Doe', null],
        ['r2', 1, 'Anonymous', 'Sorry!'],
      ]
    );
    assert.ok(calls[0].url.startsWith('https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews?'));
    assert.equal(calls[0].auth, 'Bearer tok');

    await provider.publishReply({ accountId: 'accounts/1', locationId: 'locations/2', accessToken: 'tok', reviewId: 'r1', replyText: 'Thank you!' });
    const put = calls.at(-1)!;
    assert.equal(put.method, 'PUT');
    assert.equal(put.url, 'https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/r1/reply');
    assert.deepEqual(JSON.parse(put.body!), { comment: 'Thank you!' });

    const auth = new URL(provider.buildAuthUrl('state-123'));
    assert.equal(auth.searchParams.get('scope'), 'https://www.googleapis.com/auth/business.manage');
    assert.equal(auth.searchParams.get('access_type'), 'offline');
    assert.equal(auth.searchParams.get('state'), 'state-123');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
// The fake stores loosely typed rows: inserted NewReviewRows merged with later ReviewPatches.
type Row = {
  id: string;
  googleReviewId: string;
  reviewerName: string;
  starRating: number;
  comment: string | null;
  replyStatus: string;
  replyText: string | null;
  replyError?: string | null;
  approvedBy?: string;
  [extra: string]: unknown;
};

class FakeReviewStore implements ReviewStore {
  config: ReviewConfig = {
    organizationId: 'org-1',
    businessName: 'Acme Plumbing',
    subscriptionStatus: 'active',
    accountId: 'accounts/mock-1',
    locationId: 'locations/mock-1',
    autoReplyEnabled: true,
    autoReplyMinStars: 1,
    autoPublishMinStars: 4,
    replyTone: 'warm',
    customInstructions: null,
  };
  tokens: StoredTokens = { encryptedRefreshToken: encryptToken('refresh', KEY), encryptedAccessToken: encryptToken('access', KEY), expiresAt: '2099-01-01T00:00:00Z' };
  rows = new Map<string, Row>();
  usage = 0;
  async getConfig() {
    return this.config;
  }
  async getTokens() {
    return this.tokens;
  }
  async saveAccessToken(_o: string, enc: string, exp: string) {
    this.tokens = { ...this.tokens, encryptedAccessToken: enc, expiresAt: exp };
  }
  async insertNewReviews(_o: string, rows: NewReviewRow[]) {
    let n = 0;
    for (const r of rows) {
      if ([...this.rows.values()].some((x) => x.googleReviewId === r.googleReviewId)) continue;
      const id = `id-${r.googleReviewId}`;
      this.rows.set(id, { ...r, id } as Row);
      n++;
    }
    return n;
  }
  async claimForReply(_o: string, limit: number): Promise<ClaimedReview[]> {
    const claimed = [...this.rows.values()].filter((r) => r.replyStatus === 'pending').slice(0, limit);
    for (const r of claimed) r.replyStatus = 'generating';
    return claimed.map((r) => ({ id: r.id, googleReviewId: r.googleReviewId, reviewerName: r.reviewerName, starRating: r.starRating, comment: r.comment }));
  }
  async updateReview(id: string, _o: string, patch: ReviewPatch) {
    Object.assign(this.rows.get(id)!, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }
  async markSynced() {}
  async incrementReplyUsage() {
    this.usage++;
  }
  byGoogleId(id: string) {
    return [...this.rows.values()].find((r) => r.googleReviewId === id)!;
  }
}

function engine(overrides: Partial<ReviewEngineDeps> = {}) {
  const store = new FakeReviewStore();
  const google = new MockReviewsProvider();
  const errors: string[] = [];
  const deps: ReviewEngineDeps = {
    store,
    google,
    llm: new MockLlmProvider(),
    encryptionKey: KEY,
    now: () => new Date('2026-10-20T12:00:00Z'),
    logger: { warn: (m) => void errors.push(m), error: (m) => void errors.push(m) },
    ...overrides,
  };
  return { store, google, deps, errors };
}

test('sync: 5-star reply auto-published, 2-star drafted for approval, usage metered', async () => {
  const { store, google, deps } = engine();
  const report = await syncOrganizationReviews('org-1', deps);
  assert.deepEqual(report, { imported: 2, drafted: 2, published: 1, failed: 0 });
  assert.equal(store.byGoogleId('mock-rev-001').replyStatus, 'published');
  const negative = store.byGoogleId('mock-rev-002');
  assert.equal(negative.replyStatus, 'manual_review');
  assert.match(negative.replyText!, /^Hello Marcus,/);
  assert.equal(google.publishedReplies.length, 1);
  assert.equal(google.publishedReplies[0].reviewId, 'mock-rev-001');
  assert.equal(store.usage, 2);
});

test('sync is idempotent: a second run imports nothing and never replies twice', async () => {
  const { store, google, deps } = engine();
  await syncOrganizationReviews('org-1', deps);
  const second = await syncOrganizationReviews('org-1', deps);
  assert.deepEqual(second, { imported: 0, drafted: 0, published: 0, failed: 0 });
  assert.equal(google.publishedReplies.length, 1);
  assert.equal(store.usage, 2);
});

test('reviews already answered on Google are recorded as replied and never re-answered', async () => {
  const { store, google, deps } = engine();
  google.reviews[0].reviewReply = { comment: 'Thanks from the owner!', updateTime: '2026-10-19T00:00:00Z' };
  await syncOrganizationReviews('org-1', deps);
  const row = store.byGoogleId('mock-rev-001');
  assert.equal(row.replyStatus, 'published');
  assert.equal(row.replyText, 'Thanks from the owner!');
  assert.equal(google.publishedReplies.length, 0);
});

test('a 5-star review the model reads as negative waits for approval', async () => {
  const sarcastic: ILlmProvider = {
    generateReviewReply: async () => ({ replyText: 'We hear you.', sentiment: 'negative', modelUsed: 'm', promptTokens: 0, completionTokens: 0 }),
  };
  const { store, google, deps } = engine({ llm: sarcastic });
  await syncOrganizationReviews('org-1', deps);
  assert.equal(store.byGoogleId('mock-rev-001').replyStatus, 'manual_review');
  assert.equal(google.publishedReplies.length, 0);
});

test('failures degrade to human review: AI failure -> failed, Google publish failure -> manual_review', async () => {
  const broken: ILlmProvider = { generateReviewReply: async () => Promise.reject(new Error('rate limited')) };
  const a = engine({ llm: broken });
  const ra = await syncOrganizationReviews('org-1', a.deps);
  assert.equal(ra.failed, 2);
  assert.equal(a.store.byGoogleId('mock-rev-001').replyStatus, 'failed');

  const b = engine();
  b.google.publishReply = async () => Promise.reject(new Error('Google 500'));
  await syncOrganizationReviews('org-1', b.deps);
  const row = b.store.byGoogleId('mock-rev-001');
  assert.equal(row.replyStatus, 'manual_review');
  assert.match(row.replyError!, /Publishing to Google failed/);
  assert.ok(row.replyText, 'draft kept');
});

test('sync skips orgs that are not connected or not paying; AI drafting can be turned off', async () => {
  const a = engine();
  a.store.config = { ...a.store.config, locationId: null };
  assert.equal((await syncOrganizationReviews('org-1', a.deps)).skipped, 'not_connected');
  const b = engine();
  b.store.config = { ...b.store.config, subscriptionStatus: 'canceled' };
  assert.equal((await syncOrganizationReviews('org-1', b.deps)).skipped, 'billing_inactive');
  const c = engine();
  c.store.config = { ...c.store.config, autoReplyEnabled: false };
  const report = await syncOrganizationReviews('org-1', c.deps);
  assert.equal(report.drafted, 0);
  assert.equal(c.store.byGoogleId('mock-rev-001').replyStatus, 'manual_review');
});

test('expired access token is refreshed and re-encrypted before calling Google', async () => {
  const { store, deps } = engine();
  store.tokens = { ...store.tokens, expiresAt: '2026-10-20T11:59:30Z' }; // expires in 30s
  let refreshedWith = '';
  deps.google.refreshAccessToken = async (refreshToken: string) => {
    refreshedWith = refreshToken;
    return { accessToken: 'new-access', expiresAt: new Date('2026-10-20T13:00:00Z') };
  };
  await syncOrganizationReviews('org-1', deps);
  assert.equal(refreshedWith, 'refresh');
  assert.equal(decryptToken(store.tokens.encryptedAccessToken!, KEY), 'new-access');
});

test('owner approval publishes the edited reply and records who approved it', async () => {
  const { store, google, deps } = engine();
  await syncOrganizationReviews('org-1', deps);
  const draft = store.byGoogleId('mock-rev-002');
  const result = await publishApprovedReply(
    { organizationId: 'org-1', reviewId: draft.id, googleReviewId: 'mock-rev-002', replyText: '  Sorry, Marcus. Please call us.  ', approvedBy: 'user-1' },
    deps
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(google.publishedReplies.at(-1)?.replyText, 'Sorry, Marcus. Please call us.');
  assert.equal(draft.replyStatus, 'published');
  assert.equal(draft.approvedBy, 'user-1');

  assert.deepEqual(await publishApprovedReply({ organizationId: 'org-1', reviewId: draft.id, googleReviewId: 'x', replyText: '   ', approvedBy: 'u' }, deps), { ok: false, error: 'empty' });
  google.publishReply = async () => Promise.reject(new Error('403'));
  const failed = await publishApprovedReply({ organizationId: 'org-1', reviewId: draft.id, googleReviewId: 'mock-rev-002', replyText: 'Edited', approvedBy: 'u' }, deps);
  assert.deepEqual(failed, { ok: false, error: 'publish_failed' });
});
