import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canManage, requireOrganization } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/dashboard/format';
import { getGoogleConnection, getOrganizationDetails, listReviews } from '@/lib/dashboard/queries';
import { ReviewCard } from './review-card';
import { SyncButton } from './sync-button';
import { siteConfig } from '@/lib/site';

export const metadata = { title: `Reviews · ${siteConfig.name}` };

export default async function ReviewsPage() {
  const session = await requireOrganization();
  const [connection, reviews, org] = await Promise.all([
    getGoogleConnection(session.supabase),
    listReviews(session.supabase),
    getOrganizationDetails(session.supabase, session.organizationId),
  ]);
  const manager = canManage(session.role);

  if (!connection?.google_location_id) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Google reviews</CardTitle>
          <CardDescription>
            Connect your Google Business Profile and we&apos;ll draft a reply to every new review. Positive ones can post automatically; you approve the rest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {manager ? (
            <Link href="/dashboard/settings#google" className="font-medium text-primary underline-offset-4 hover:underline">
              Connect Google in Settings →
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Ask an owner or admin to connect Google.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const waiting = reviews.filter((r) => r.reply_status === 'manual_review' || r.reply_status === 'failed').length;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Google reviews</h1>
          <p className="text-sm text-muted-foreground">
            {connection.location_name ?? 'Connected'} ·{' '}
            {connection.last_synced_at ? `last synced ${formatDateTime(connection.last_synced_at, org.timezone)}` : 'not synced yet'}
            {waiting ? ` · ${waiting} waiting for you` : ''}
          </p>
        </div>
        {manager ? <SyncButton /> : null}
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet. New reviews appear here after each sync.</p>
      ) : (
        reviews.map((review) => (
          <ReviewCard key={review.id} review={review} date={formatDateTime(review.review_created_at, org.timezone)} canPublish={manager} />
        ))
      )}
    </div>
  );
}
