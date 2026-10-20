import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/dashboard/auto-refresh';
import { MessageThread, OPTED_OUT_REASON, ThreadHeader } from '@/components/dashboard/views';
import { Card, CardContent } from '@/components/ui/card';
import { requireOrganization } from '@/lib/auth/session';
import { getOrganizationDetails, getThread, isContactOptedOut } from '@/lib/dashboard/queries';
import { E164 } from '@/lib/telephony/rescue-sms';
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
      <ThreadHeader contact={contact} optedOut={optedOut} basePath="/dashboard" />
      <CardContent className="flex flex-col gap-6">
        <MessageThread messages={thread} timezone={org.timezone} />
        <ReplyForm to={contact} disabledReason={optedOut ? OPTED_OUT_REASON : undefined} />
      </CardContent>
    </Card>
  );
}
