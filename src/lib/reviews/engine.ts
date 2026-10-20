import { billingAllowsService } from '../billing/status';
import { decryptToken, encryptToken } from '../crypto/token-cipher';
import type { ILlmProvider } from '../providers/llm/types';
import type { GoogleReviewItem, IReviewsProvider } from '../providers/reviews/types';

export interface ReviewConfig {
  organizationId: string;
  businessName: string;
  subscriptionStatus: string | null;
  accountId: string | null;
  locationId: string | null;
  autoReplyEnabled: boolean;
  autoReplyMinStars: number;
  autoPublishMinStars: number;
  replyTone: string;
  customInstructions: string | null;
}

export interface StoredTokens {
  encryptedRefreshToken: string;
  encryptedAccessToken: string | null;
  expiresAt: string | null;
}

export interface NewReviewRow {
  googleReviewId: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  starRating: number;
  comment: string | null;
  reviewCreatedAt: string;
  replyStatus: 'pending' | 'manual_review' | 'published';
  replyText: string | null;
  replyPublishedAt: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface ClaimedReview {
  id: string;
  googleReviewId: string;
  reviewerName: string;
  starRating: number;
  comment: string | null;
}

export interface ReviewPatch {
  replyStatus?: 'manual_review' | 'published' | 'failed';
  replyText?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  aiModel?: string;
  aiGeneratedAt?: string;
  replyPublishedAt?: string;
  replyError?: string | null;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ReviewStore {
  getConfig(organizationId: string): Promise<ReviewConfig | null>;
  getTokens(organizationId: string): Promise<StoredTokens | null>;
  saveAccessToken(organizationId: string, encryptedAccessToken: string, expiresAt: string): Promise<void>;
  // Inserts reviews not seen before; existing rows (by google_review_id) are left untouched.
  insertNewReviews(organizationId: string, rows: NewReviewRow[]): Promise<number>;
  claimForReply(organizationId: string, limit: number): Promise<ClaimedReview[]>;
  updateReview(reviewId: string, organizationId: string, patch: ReviewPatch): Promise<void>;
  markSynced(organizationId: string): Promise<void>;
  incrementReplyUsage(organizationId: string): Promise<void>;
}

export interface ReviewEngineDeps {
  store: ReviewStore;
  google: IReviewsProvider;
  llm: ILlmProvider;
  encryptionKey: string | undefined;
  now: () => Date;
  logger: { warn(m: string, c?: Record<string, unknown>): void; error(m: string, c?: Record<string, unknown>): void };
}

export interface SyncReport {
  skipped?: 'not_connected' | 'billing_inactive' | 'no_config';
  imported: number;
  drafted: number;
  published: number;
  failed: number;
}

const sentimentOf = (stars: number) => (stars >= 4 ? 'positive' : stars === 3 ? 'neutral' : 'negative') as NewReviewRow['sentiment'];

// Returns a usable access token, refreshing (and re-encrypting) it when it is about to expire.
export async function getAccessToken(organizationId: string, deps: Pick<ReviewEngineDeps, 'store' | 'google' | 'encryptionKey' | 'now'>): Promise<string> {
  const tokens = await deps.store.getTokens(organizationId);
  if (!tokens) throw new Error('Google is not connected for this organization');
  const expiresAt = tokens.expiresAt ? Date.parse(tokens.expiresAt) : 0;
  if (tokens.encryptedAccessToken && expiresAt - deps.now().getTime() > 60_000) {
    return decryptToken(tokens.encryptedAccessToken, deps.encryptionKey);
  }
  const refreshed = await deps.google.refreshAccessToken(decryptToken(tokens.encryptedRefreshToken, deps.encryptionKey));
  await deps.store.saveAccessToken(organizationId, encryptToken(refreshed.accessToken, deps.encryptionKey), refreshed.expiresAt.toISOString());
  return refreshed.accessToken;
}

export function toNewReviewRow(review: GoogleReviewItem, config: ReviewConfig): NewReviewRow {
  const alreadyReplied = !!review.reviewReply?.comment;
  const eligibleForAi = config.autoReplyEnabled && review.starRating >= config.autoReplyMinStars;
  return {
    googleReviewId: review.reviewId,
    reviewerName: review.reviewerName || 'Anonymous',
    reviewerPhotoUrl: review.reviewerPhotoUrl ?? null,
    starRating: review.starRating,
    comment: review.comment ?? null,
    reviewCreatedAt: review.createTime,
    // Replied outside the app (or before signing up): record it, never answer twice.
    replyStatus: alreadyReplied ? 'published' : eligibleForAi ? 'pending' : 'manual_review',
    replyText: review.reviewReply?.comment ?? null,
    replyPublishedAt: review.reviewReply?.updateTime ?? null,
    sentiment: sentimentOf(review.starRating),
  };
}

// One organization: import new reviews, draft AI replies, auto-publish the ones that qualify.
export async function syncOrganizationReviews(organizationId: string, deps: ReviewEngineDeps, opts: { maxDrafts?: number } = {}): Promise<SyncReport> {
  const report: SyncReport = { imported: 0, drafted: 0, published: 0, failed: 0 };
  const config = await deps.store.getConfig(organizationId);
  if (!config) return { ...report, skipped: 'no_config' };
  if (!config.accountId || !config.locationId) return { ...report, skipped: 'not_connected' };
  if (!billingAllowsService(config.subscriptionStatus)) return { ...report, skipped: 'billing_inactive' };

  const accessToken = await getAccessToken(organizationId, deps);
  const location = { accountId: config.accountId, locationId: config.locationId, accessToken };
  const reviews = await deps.google.listReviews(location);
  report.imported = await deps.store.insertNewReviews(organizationId, reviews.map((r) => toNewReviewRow(r, config)));
  await deps.store.markSynced(organizationId);

  const claimed = await deps.store.claimForReply(organizationId, opts.maxDrafts ?? 20);
  for (const review of claimed) {
    let draft: Awaited<ReturnType<ILlmProvider['generateReviewReply']>>;
    try {
      draft = await deps.llm.generateReviewReply({
        businessName: config.businessName,
        reviewerName: review.reviewerName,
        starRating: review.starRating,
        reviewComment: review.comment ?? undefined,
        tone: config.replyTone,
        customInstructions: config.customInstructions,
      });
    } catch (err) {
      deps.logger.error('AI reply generation failed', { organizationId, reviewId: review.id, error: String(err) });
      await deps.store.updateReview(review.id, organizationId, { replyStatus: 'failed', replyError: 'AI draft failed; write a reply manually.' });
      report.failed++;
      continue;
    }
    report.drafted++;
    await deps.store.incrementReplyUsage(organizationId);
    const generated: ReviewPatch = {
      replyText: draft.replyText,
      sentiment: draft.sentiment,
      aiModel: draft.modelUsed,
      aiGeneratedAt: deps.now().toISOString(),
      replyError: null,
    };

    // Auto-publish only clearly positive reviews at or above the owner's threshold; everything
    // else waits for a human. A model calling a 5-star review "negative" also waits.
    const autoPublish = review.starRating >= config.autoPublishMinStars && draft.sentiment === 'positive';
    if (!autoPublish) {
      await deps.store.updateReview(review.id, organizationId, { ...generated, replyStatus: 'manual_review' });
      continue;
    }
    try {
      await deps.google.publishReply({ ...location, reviewId: review.googleReviewId, replyText: draft.replyText });
      await deps.store.updateReview(review.id, organizationId, { ...generated, replyStatus: 'published', replyPublishedAt: deps.now().toISOString() });
      report.published++;
    } catch (err) {
      deps.logger.error('Auto-publish failed; left for review', { organizationId, reviewId: review.id, error: String(err) });
      await deps.store.updateReview(review.id, organizationId, { ...generated, replyStatus: 'manual_review', replyError: 'Publishing to Google failed; try again.' });
      report.failed++;
    }
  }
  return report;
}

export type PublishResult = { ok: true } | { ok: false; error: 'empty' | 'too_long' | 'not_connected' | 'billing_inactive' | 'publish_failed' };

// Owner/admin approval from the dashboard (the role check happens in the caller).
export async function publishApprovedReply(
  input: { organizationId: string; reviewId: string; googleReviewId: string; replyText: string; approvedBy: string },
  deps: ReviewEngineDeps
): Promise<PublishResult> {
  const replyText = input.replyText.trim();
  if (!replyText) return { ok: false, error: 'empty' };
  if (replyText.length > 4000) return { ok: false, error: 'too_long' };
  const config = await deps.store.getConfig(input.organizationId);
  if (!config?.accountId || !config.locationId) return { ok: false, error: 'not_connected' };
  if (!billingAllowsService(config.subscriptionStatus)) return { ok: false, error: 'billing_inactive' };

  try {
    const accessToken = await getAccessToken(input.organizationId, deps);
    await deps.google.publishReply({ accountId: config.accountId, locationId: config.locationId, accessToken, reviewId: input.googleReviewId, replyText });
  } catch (err) {
    deps.logger.error('Approved reply publish failed', { organizationId: input.organizationId, reviewId: input.reviewId, error: String(err) });
    await deps.store.updateReview(input.reviewId, input.organizationId, { replyText, replyError: 'Publishing to Google failed; try again.' });
    return { ok: false, error: 'publish_failed' };
  }
  const now = deps.now().toISOString();
  await deps.store.updateReview(input.reviewId, input.organizationId, {
    replyStatus: 'published',
    replyText,
    replyPublishedAt: now,
    approvedBy: input.approvedBy,
    approvedAt: now,
    replyError: null,
  });
  return { ok: true };
}
