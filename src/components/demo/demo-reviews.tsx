'use client';

import { ReviewCard } from '@/app/dashboard/reviews/review-card';
import type { ReviewActionState } from '@/app/dashboard/reviews/actions';
import type { ReviewRow } from '@/lib/dashboard/queries';

// Demo review approvals: the card switches to "Replied" locally; nothing is sent to Google.
async function demoSaveDraft(): Promise<ReviewActionState> {
  return { notice: 'Draft saved (demo).' };
}

async function demoPublish(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const replyText = String(formData.get('replyText') ?? '').trim();
  if (!replyText) return { error: 'Write a reply first.' };
  return { notice: 'Published (demo: nothing was sent to Google).', publishedText: replyText };
}

export function DemoReviews({ reviews }: { reviews: Array<{ review: ReviewRow; date: string }> }) {
  return (
    <>
      {reviews.map(({ review, date }) => (
        <ReviewCard key={review.id} review={review} date={date} canPublish draftAction={demoSaveDraft} publishAction={demoPublish} />
      ))}
    </>
  );
}
