import { notFound } from 'next/navigation';
import { CallDetailView } from '@/components/dashboard/views';
import { buildDemoData } from '@/lib/demo/data';

export const dynamic = 'force-dynamic';

export default async function DemoCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { calls, business } = buildDemoData();
  const call = calls.find((c) => c.id === id);
  if (!call) notFound();
  return <CallDetailView call={call} timezone={business.timezone} basePath="/demo" />;
}
