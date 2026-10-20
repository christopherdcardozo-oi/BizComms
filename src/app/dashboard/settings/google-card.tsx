'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GoogleConnection } from '@/lib/dashboard/queries';
import { updateReviewSettings } from '../reviews/actions';

const CONNECT_RESULTS: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'Google Business Profile connected. Reviews will sync shortly.', ok: true },
  denied: { text: 'Google access was not granted.', ok: false },
  expired: { text: 'That connection attempt expired. Please try again.', ok: false },
  no_locations: { text: 'That Google account doesn’t manage any business locations.', ok: false },
  billing: { text: 'Your subscription is inactive. Update billing first.', ok: false },
  forbidden: { text: 'Only owners and admins can connect Google.', ok: false },
  unavailable: { text: 'Google connection isn’t available right now.', ok: false },
  failed: { text: 'Connecting Google failed. Please try again.', ok: false },
};

export function GoogleCard({ connection, canEdit, result }: { connection: GoogleConnection | null; canEdit: boolean; result?: string }) {
  const [state, action, pending] = useActionState(updateReviewSettings, {});
  const connected = !!connection?.google_location_id;
  const banner = result ? CONNECT_RESULTS[result] : undefined;

  return (
    <Card id="google" className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          Google reviews <Badge variant={connected ? 'success' : 'secondary'}>{connected ? 'Connected' : 'Not connected'}</Badge>
        </CardTitle>
        <CardDescription>
          {connected ? `Location: ${connection?.location_name ?? 'connected'}` : 'Connect the Google account that manages your Business Profile.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {banner ? <Alert variant={banner.ok ? 'success' : 'destructive'}>{banner.text}</Alert> : null}
        {canEdit ? (
          <div>
            <Button asChild variant={connected ? 'outline' : 'default'}>
              <a href="/api/auth/google/start">{connected ? 'Reconnect Google' : 'Connect Google Business Profile'}</a>
            </Button>
          </div>
        ) : null}

        {connected && connection ? (
          <form action={action} className="flex flex-col gap-5">
            <fieldset disabled={!canEdit || pending} className="flex flex-col gap-5">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" name="autoReplyEnabled" defaultChecked={connection.auto_reply_enabled} className="h-4 w-4 accent-primary" />
                Draft AI replies to new reviews
              </label>
              <div className="flex flex-col gap-2">
                <Label htmlFor="autoPublishMinStars">Post replies automatically for</Label>
                <select
                  id="autoPublishMinStars"
                  name="autoPublishMinStars"
                  defaultValue={String(connection.auto_publish_min_stars)}
                  className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="5">5-star reviews only</option>
                  <option value="4">4- and 5-star reviews</option>
                </select>
                <p className="text-xs text-muted-foreground">Everything else (and anything the AI reads as negative) waits for your approval.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="replyTone">Tone</Label>
                <Input id="replyTone" name="replyTone" maxLength={200} defaultValue={connection.reply_tone} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="customInstructions">Instructions for replies</Label>
                <Textarea
                  id="customInstructions"
                  name="customInstructions"
                  rows={3}
                  maxLength={1000}
                  defaultValue={connection.custom_reply_instructions ?? ''}
                  placeholder="e.g. Sign off as 'The Acme Plumbing team'. For complaints, invite them to call (515) 555-0100."
                />
              </div>
            </fieldset>
            {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
            {state.notice ? <Alert variant="success">{state.notice}</Alert> : null}
            {canEdit ? (
              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save review settings'}
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
