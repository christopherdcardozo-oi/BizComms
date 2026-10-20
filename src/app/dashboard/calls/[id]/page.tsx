import { notFound } from 'next/navigation';
import { CallDetailView } from '@/components/dashboard/views';
import { requireOrganization } from '@/lib/auth/session';
import { getCallDetail, getOrganizationDetails } from '@/lib/dashboard/queries';

export const metadata = { title: 'Call details · BizComms' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const session = await requireOrganization();
  // RLS limits this to the caller's own organization; another tenant's id is simply not found.
  const [call, org] = await Promise.all([getCallDetail(session.supabase, id), getOrganizationDetails(session.supabase, session.organizationId)]);
  if (!call) notFound();
  return <CallDetailView call={call} timezone={org.timezone} basePath="/dashboard" />;
}
