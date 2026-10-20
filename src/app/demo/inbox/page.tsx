import { ConversationList } from '@/components/dashboard/views';
import { groupConversations } from '@/lib/dashboard/conversations';
import { buildDemoData } from '@/lib/demo/data';

export const dynamic = 'force-dynamic';

export default function DemoInboxPage() {
  const { messages, business } = buildDemoData();
  const newestFirst = [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return <ConversationList conversations={groupConversations(newestFirst)} timezone={business.timezone} basePath="/demo" />;
}
