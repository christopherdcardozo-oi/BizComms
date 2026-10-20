import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/dashboard/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrganization } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/dashboard/format';
import { getOrganizationDetails, getThread, isContactOptedOut } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';
import { E164 } from '@/lib/telephony/rescue-sms';
import { cn } from '@/lib/ui/cn';
import { ReplyForm } from './reply-form';

export default async function ThreadPage({ params }: { params: Promise<{ contact: string }> }) {
  const contact = decodeURIComponent((await params).contact);
  // Validated before it is interpolated into the PostgREST filter in getThread().
  if (!E164.test(contact)) notFound();

  const session = await requireOrganization();
  const [thread, optedOut, org] = await Promise.all([
    getThread(session.supabase, contact),
    isContactOptedOut(session.supabase, contact),
    getOrganizationDetails(session.supabase, session.organizationId),
  ]);
  if (thread.length === 0) notFound();

  return (
    <Card>
      <AutoRefresh seconds={10} />
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/inbox" className="text-sm text-muted-foreground hover:text-foreground">
            ← Inbox
          </Link>
          <CardTitle className="tabular-nums">{formatNanp(contact)}</CardTitle>
        </div>
        {optedOut ? <Badge variant="destructive">Opted out</Badge> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ol className="flex flex-col gap-3" aria-label="Messages">
          {thread.map((m) => {
            const inbound = m.direction === 'inbound';
            return (
              <li key={m.id} className={cn('flex flex-col gap-1', inbound ? 'items-start' : 'items-end')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                    inbound ? 'bg-muted' : 'bg-primary text-primary-foreground'
                  )}
                >
                  {m.body}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(m.created_at, org.timezone)}
                  {!inbound && m.type === 'missed_call_auto_reply' ? ' · automatic text-back' : ''}
                  {m.status === 'failed' || m.status === 'undelivered' ? ' · not delivered' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        <ReplyForm
          to={contact}
          disabledReason={optedOut ? 'This customer replied STOP. You can text them again only after they text START.' : undefined}
        />
      </CardContent>
    </Card>
  );
}
