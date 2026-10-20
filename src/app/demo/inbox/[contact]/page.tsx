import { notFound } from 'next/navigation';
import { DemoThread } from '@/components/demo/demo-thread';
import { contactOf } from '@/lib/dashboard/conversations';
import { buildDemoData } from '@/lib/demo/data';

export const dynamic = 'force-dynamic';

export default async function DemoThreadPage({ params }: { params: Promise<{ contact: string }> }) {
  const contact = decodeURIComponent((await params).contact);
  const { messages, optedOut, business } = buildDemoData();
  const thread = messages.filter((m) => contactOf(m) === contact).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (thread.length === 0) notFound();
  return <DemoThread contact={contact} initialMessages={thread} optedOut={optedOut.has(contact)} timezone={business.timezone} from={business.number} />;
}
