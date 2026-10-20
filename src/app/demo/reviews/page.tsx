import { DemoReviews } from '@/components/demo/demo-reviews';
import { formatDateTime } from '@/lib/dashboard/format';
import { buildDemoData } from '@/lib/demo/data';

export const dynamic = 'force-dynamic';

export default function DemoReviewsPage() {
  const { reviews, business } = buildDemoData();
  const needsAttention = (status: string) => status === 'manual_review' || status === 'failed';
  const ordered = [...reviews.filter((r) => needsAttention(r.reply_status)), ...reviews.filter((r) => !needsAttention(r.reply_status))];
  const waiting = ordered.filter((r) => needsAttention(r.reply_status)).length;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Google reviews</h1>
        <p className="text-sm text-muted-foreground">
          {business.name} (Google) · last synced a few minutes ago · {waiting} waiting for you
        </p>
      </div>
      <DemoReviews reviews={ordered.map((r) => ({ review: r, date: formatDateTime(r.review_created_at, business.timezone) }))} />
    </div>
  );
}
