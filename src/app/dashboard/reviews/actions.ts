'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canManage, requireOrganization } from '@/lib/auth/session';
import { rateLimiterFallback } from '@/lib/ratelimit/limiter';
import { publishApprovedReply, syncOrganizationReviews } from '@/lib/reviews/engine';
import { getReviewEngineDeps } from '@/lib/reviews/server';

export interface ReviewActionState {
  error?: string;
  notice?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLISH_ERRORS: Record<string, string> = {
  empty: 'Write a reply first.',
  too_long: 'Keep the reply under 4,000 characters.',
  not_connected: 'Connect your Google Business Profile in Settings first.',
  billing_inactive: 'Your subscription is inactive. Update billing in Settings.',
  publish_failed: 'Google rejected the reply. Your draft is saved; try again in a minute.',
};

// Members and owners can edit drafts; RLS + the reply_text-only column grant enforce the rest.
export async function saveReviewDraft(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const session = await requireOrganization();
  const reviewId = String(formData.get('reviewId') ?? '');
  const replyText = String(formData.get('replyText') ?? '').trim();
  if (!UUID.test(reviewId)) return { error: 'Unknown review.' };
  if (replyText.length > 4000) return { error: PUBLISH_ERRORS.too_long };

  const { data, error } = await session.supabase.from('reviews').update({ reply_text: replyText }).eq('id', reviewId).select('id');
  if (error || !data?.length) return { error: 'Could not save this draft. It may already be published.' };
  revalidatePath('/dashboard/reviews');
  return { notice: 'Draft saved.' };
}

export async function approveAndPublish(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can publish replies.' };
  const reviewId = String(formData.get('reviewId') ?? '');
  if (!UUID.test(reviewId)) return { error: 'Unknown review.' };

  // Read through RLS so a forged id from another tenant is simply not found.
  const { data: review } = await session.supabase.from('reviews').select('id, google_review_id, reply_status').eq('id', reviewId).maybeSingle();
  const row = review as { id: string; google_review_id: string; reply_status: string } | null;
  if (!row) return { error: 'Unknown review.' };
  if (row.reply_status === 'published') return { notice: 'Already published.' };

  const limit = await rateLimiterFallback.limit(`review-publish:${session.userId}`, 20, 60);
  if (!limit.success) return { error: 'Slow down: too many replies in a minute.' };

  const result = await publishApprovedReply(
    { organizationId: session.organizationId, reviewId: row.id, googleReviewId: row.google_review_id, replyText: String(formData.get('replyText') ?? ''), approvedBy: session.userId },
    getReviewEngineDeps()
  );
  revalidatePath('/dashboard/reviews');
  return result.ok ? { notice: 'Published to Google.' } : { error: PUBLISH_ERRORS[result.error] };
}

export async function syncReviewsNow(_prev: ReviewActionState): Promise<ReviewActionState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can sync reviews.' };
  const limit = await rateLimiterFallback.limit(`review-sync:${session.organizationId}`, 3, 300);
  if (!limit.success) return { error: 'Reviews were synced recently. Try again in a few minutes.' };
  try {
    const report = await syncOrganizationReviews(session.organizationId, getReviewEngineDeps());
    revalidatePath('/dashboard/reviews');
    if (report.skipped === 'not_connected' || report.skipped === 'no_config') return { error: PUBLISH_ERRORS.not_connected };
    if (report.skipped === 'billing_inactive') return { error: PUBLISH_ERRORS.billing_inactive };
    return { notice: `Synced: ${report.imported} new, ${report.drafted} drafted, ${report.published} auto-published.` };
  } catch {
    return { error: 'Could not reach Google. Try reconnecting in Settings.' };
  }
}

const settingsSchema = z.object({
  autoReplyEnabled: z.boolean(),
  autoPublishMinStars: z.coerce.number().int().min(1).max(5),
  replyTone: z.string().trim().min(1, 'Describe the tone in a few words.').max(200),
  customInstructions: z.string().trim().max(1000, 'Keep instructions under 1,000 characters.'),
});

export async function updateReviewSettings(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const session = await requireOrganization();
  if (!canManage(session.role)) return { error: 'Only owners and admins can change review settings.' };
  const parsed = settingsSchema.safeParse({
    autoReplyEnabled: formData.get('autoReplyEnabled') === 'on',
    autoPublishMinStars: formData.get('autoPublishMinStars'),
    replyTone: formData.get('replyTone'),
    customInstructions: String(formData.get('customInstructions') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await session.supabase
    .from('google_configs')
    .update({
      auto_reply_enabled: parsed.data.autoReplyEnabled,
      auto_publish_min_stars: parsed.data.autoPublishMinStars,
      reply_tone: parsed.data.replyTone,
      custom_reply_instructions: parsed.data.customInstructions || null,
    })
    .eq('organization_id', session.organizationId)
    .select('id');
  if (error || !data?.length) return { error: 'Connect Google first, then adjust these settings.' };
  revalidatePath('/dashboard/settings');
  return { notice: 'Saved.' };
}
