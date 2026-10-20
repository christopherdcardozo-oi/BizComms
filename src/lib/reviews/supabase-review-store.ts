import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaimedReview, NewReviewRow, ReviewConfig, ReviewPatch, ReviewStore, StoredTokens } from './engine';

function must<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

// Service role: google_tokens is invisible to clients and review status/approval columns are
// not client-writable, so every engine write goes through here after the caller's checks.
export class SupabaseReviewStore implements ReviewStore {
  constructor(private admin: SupabaseClient) {}

  async getConfig(organizationId: string): Promise<ReviewConfig | null> {
    const row = must(
      await this.admin
        .from('google_configs')
        .select('google_account_id, google_location_id, auto_reply_enabled, auto_reply_min_stars, auto_publish_min_stars, reply_tone, custom_reply_instructions, organizations!inner(name, subscription_status, stripe_price_id)')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      'getConfig'
    ) as unknown as {
      google_account_id: string | null;
      google_location_id: string | null;
      auto_reply_enabled: boolean;
      auto_reply_min_stars: number;
      auto_publish_min_stars: number;
      reply_tone: string;
      custom_reply_instructions: string | null;
      organizations: { name: string; subscription_status: string | null; stripe_price_id: string | null };
    } | null;
    if (!row) return null;
    return {
      organizationId,
      businessName: row.organizations.name,
      subscriptionStatus: row.organizations.subscription_status,
      stripePriceId: row.organizations.stripe_price_id,
      accountId: row.google_account_id,
      locationId: row.google_location_id,
      autoReplyEnabled: row.auto_reply_enabled,
      autoReplyMinStars: row.auto_reply_min_stars,
      autoPublishMinStars: row.auto_publish_min_stars,
      replyTone: row.reply_tone,
      customInstructions: row.custom_reply_instructions,
    };
  }

  async getTokens(organizationId: string): Promise<StoredTokens | null> {
    const row = must(
      await this.admin.from('google_tokens').select('encrypted_refresh_token, encrypted_access_token, token_expires_at').eq('organization_id', organizationId).maybeSingle(),
      'getTokens'
    ) as { encrypted_refresh_token: string; encrypted_access_token: string | null; token_expires_at: string | null } | null;
    return row ? { encryptedRefreshToken: row.encrypted_refresh_token, encryptedAccessToken: row.encrypted_access_token, expiresAt: row.token_expires_at } : null;
  }

  async saveAccessToken(organizationId: string, encryptedAccessToken: string, expiresAt: string): Promise<void> {
    must(await this.admin.from('google_tokens').update({ encrypted_access_token: encryptedAccessToken, token_expires_at: expiresAt }).eq('organization_id', organizationId), 'saveAccessToken');
  }

  async saveConnection(
    organizationId: string,
    input: { accountId: string; locationId: string; locationName: string; encryptedAccessToken: string; encryptedRefreshToken: string | null; expiresAt: string }
  ): Promise<void> {
    if (input.encryptedRefreshToken) {
      must(
        await this.admin.from('google_tokens').upsert(
          { organization_id: organizationId, encrypted_refresh_token: input.encryptedRefreshToken, encrypted_access_token: input.encryptedAccessToken, token_expires_at: input.expiresAt },
          { onConflict: 'organization_id' }
        ),
        'saveConnection tokens'
      );
    } else {
      // Google omits the refresh token on re-consent; keep the stored one.
      const existing = await this.getTokens(organizationId);
      if (!existing) throw new Error('Google did not return a refresh token; reconnect and grant access again.');
      await this.saveAccessToken(organizationId, input.encryptedAccessToken, input.expiresAt);
    }
    must(
      await this.admin.from('google_configs').upsert(
        { organization_id: organizationId, google_account_id: input.accountId, google_location_id: input.locationId, location_name: input.locationName },
        { onConflict: 'organization_id' }
      ),
      'saveConnection config'
    );
  }

  async insertNewReviews(organizationId: string, rows: NewReviewRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = must(
      await this.admin
        .from('reviews')
        .upsert(
          rows.map((r) => ({
            organization_id: organizationId,
            google_review_id: r.googleReviewId,
            reviewer_name: r.reviewerName,
            reviewer_photo_url: r.reviewerPhotoUrl,
            star_rating: r.starRating,
            comment: r.comment,
            review_created_at: r.reviewCreatedAt,
            reply_status: r.replyStatus,
            reply_text: r.replyText,
            reply_published_at: r.replyPublishedAt,
            sentiment: r.sentiment,
          })),
          { onConflict: 'google_review_id', ignoreDuplicates: true }
        )
        .select('id'),
      'insertNewReviews'
    ) as { id: string }[] | null;
    return inserted?.length ?? 0;
  }

  async claimForReply(organizationId: string, limit: number): Promise<ClaimedReview[]> {
    const rows = must(await this.admin.rpc('claim_reviews_for_reply', { p_org_id: organizationId, p_limit: limit }), 'claimForReply') as Array<{
      id: string;
      google_review_id: string;
      reviewer_name: string;
      star_rating: number;
      comment: string | null;
    }> | null;
    return (rows ?? []).map((r) => ({ id: r.id, googleReviewId: r.google_review_id, reviewerName: r.reviewer_name, starRating: r.star_rating, comment: r.comment }));
  }

  async updateReview(reviewId: string, organizationId: string, patch: ReviewPatch): Promise<void> {
    const columns: Record<string, unknown> = {};
    if (patch.replyStatus !== undefined) columns.reply_status = patch.replyStatus;
    if (patch.replyText !== undefined) columns.reply_text = patch.replyText;
    if (patch.sentiment !== undefined) columns.sentiment = patch.sentiment;
    if (patch.aiModel !== undefined) columns.ai_model = patch.aiModel;
    if (patch.aiGeneratedAt !== undefined) columns.ai_generated_at = patch.aiGeneratedAt;
    if (patch.replyPublishedAt !== undefined) columns.reply_published_at = patch.replyPublishedAt;
    if (patch.replyError !== undefined) columns.reply_error = patch.replyError;
    if (patch.approvedBy !== undefined) columns.approved_by = patch.approvedBy;
    if (patch.approvedAt !== undefined) columns.approved_at = patch.approvedAt;
    must(await this.admin.from('reviews').update(columns).eq('id', reviewId).eq('organization_id', organizationId), 'updateReview');
  }

  async markSynced(organizationId: string): Promise<void> {
    must(await this.admin.from('google_configs').update({ last_synced_at: new Date().toISOString() }).eq('organization_id', organizationId), 'markSynced');
  }

  async incrementReplyUsage(organizationId: string): Promise<void> {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    must(await this.admin.rpc('increment_usage', { p_org_id: organizationId, p_period_start: periodStart, p_review_replies: 1 }), 'incrementReplyUsage');
  }

  async listConnectedOrganizations(limit = 200): Promise<string[]> {
    const rows = must(
      await this.admin.from('google_configs').select('organization_id').not('google_location_id', 'is', null).order('last_synced_at', { ascending: true, nullsFirst: true }).limit(limit),
      'listConnectedOrganizations'
    ) as { organization_id: string }[] | null;
    return (rows ?? []).map((r) => r.organization_id);
  }
}
