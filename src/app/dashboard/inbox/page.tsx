import { AutoRefresh } from '@/components/dashboard/auto-refresh';
import { ConversationList } from '@/components/dashboard/views';
import { requireOrganization } from '@/lib/auth/session';
import { groupConversations } from '@/lib/dashboard/conversations';
import { getOrganizationDetails, listRecentMessages } from '@/lib/dashboard/queries';

export const metadata = { title: 'Inbox · BizComms' };

export default async function InboxPage() {
  const session = await requireOrganization();
  const [messages, org] = await Promise.all([
    listRecentMessages(session.supabase),
    getOrganizationDetails(session.supabase, session.organizationId),
  ]);
  return (
    <>
      <AutoRefresh />
      <ConversationList conversations={groupConversations(messages)} timezone={org.timezone} basePath="/dashboard" />
    </>
  );
}
