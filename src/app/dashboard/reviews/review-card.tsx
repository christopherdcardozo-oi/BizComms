'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Stars } from '@/components/ui/stars';
import type { ReviewRow } from '@/lib/dashboard/queries';
import { approveAndPublish, saveReviewDraft, type ReviewActionState } from './actions';

const STATUS: Record<ReviewRow['reply_status'], { label: string; tone: 'success' | 'warning' | 'secondary' | 'destructive' | 'default' }> = {
  published: { label: 'Replied', tone: 'success' },
  manual_review: { label: 'Needs your approval', tone: 'warning' },
  failed: { label: 'Needs attention', tone: 'destructive' },
  pending: { label: 'Waiting for AI draft', tone: 'secondary' },
  generating: { label: 'Drafting…', tone: 'secondary' },
  skipped: { label: 'Skipped', tone: 'secondary' },
};

type ReviewAction = (prev: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;

export function ReviewCard({
  review,
  date,
  canPublish,
  draftAction: saveDraft = saveReviewDraft,
  publishAction: publish = approveAndPublish,
}: {
  review: ReviewRow;
  date: string;
  canPublish: boolean;
  draftAction?: ReviewAction;
  publishAction?: ReviewAction;
}) {
  const [draftState, draftAction, saving] = useActionState(saveDraft, {});
  const [publishState, publishAction, publishing] = useActionState(publish, {});
  const published = review.reply_status === 'published' || !!publishState.publishedText;
  const status = STATUS[published ? 'published' : review.reply_status];
  const replyText = publishState.publishedText ?? review.reply_text;
  const state = publishState.error || publishState.notice ? publishState : draftState;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{review.reviewer_name}</span>
            <Stars count={review.star_rating} />
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
        {review.comment ? <p className="text-sm">{review.comment}</p> : <p className="text-sm italic text-muted-foreground">Rating only, no text.</p>}

        {published ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Your reply</span>
              <p>{replyText}</p>
            </div>
            {publishState.notice ? <Alert variant="success">{publishState.notice}</Alert> : null}
          </div>
        ) : review.reply_status === 'pending' || review.reply_status === 'generating' ? (
          <p className="text-sm text-muted-foreground">The AI will draft a reply on the next sync.</p>
        ) : (
          <form className="flex flex-col gap-2">
            <input type="hidden" name="reviewId" value={review.id} />
            <label htmlFor={`reply-${review.id}`} className="text-xs font-medium text-muted-foreground">
              {review.ai_model ? 'AI draft (edit freely before publishing)' : 'Your reply'}
            </label>
            <Textarea id={`reply-${review.id}`} name="replyText" rows={4} maxLength={4000} defaultValue={review.reply_text ?? ''} />
            {review.reply_error ? <Alert variant="destructive">{review.reply_error}</Alert> : null}
            {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
            {state.notice ? <Alert variant="success">{state.notice}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" variant="outline" formAction={draftAction} disabled={saving || publishing}>
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
              {canPublish ? (
                <Button type="submit" formAction={publishAction} disabled={saving || publishing}>
                  {publishing ? 'Publishing…' : 'Approve & publish to Google'}
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
