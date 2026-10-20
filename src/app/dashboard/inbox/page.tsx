import Link from 'next/link';
import { AutoRefresh } from '@/components/dashboard/auto-refresh';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrganization } from '@/lib/auth/session';
import { groupConversations } from '@/lib/dashboard/conversations';
import { formatDateTime } from '@/lib/dashboard/format';
import { getOrganizationDetails, listRecentMessages } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';

export const metadata = { title: 'Inbox · BizComms' };

export default async function InboxPage() {
  const session = await requireOrganization();
  const [messages, org] = await Promise.all([
    listRecentMessages(session.supabase),
    getOrganizationDetails(session.supabase, session.organizationId),
  ]);
  const conversations = groupConversations(messages);

  return (
    <Card>
      <AutoRefresh />
      <CardHeader>
        <CardTitle>Inbox</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {conversations.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No texts yet. When a caller you missed texts back, the conversation shows up here.
          </p>
        ) : (
          <ul className="divide-y">
            {conversations.map((c) => (
              <li key={c.contact}>
                <Link
                  href={`/dashboard/inbox/${encodeURIComponent(c.contact)}`}
                  className="flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-accent"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 font-medium tabular-nums">
                      {formatNanp(c.contact)}
                      {c.awaitingReply ? <Badge>Needs reply</Badge> : null}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {c.lastMessage.direction === 'inbound' ? '' : 'You: '}
                      {c.lastMessage.body}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.lastMessage.created_at, org.timezone)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
