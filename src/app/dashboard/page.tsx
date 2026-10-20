import { AutoRefresh } from '@/components/dashboard/auto-refresh';
import { CallsTable, MonthStats } from '@/components/dashboard/views';
import { Alert } from '@/components/ui/alert';
import { requireOrganization } from '@/lib/auth/session';
import { getMonthStats, getOrganizationDetails, listCallLogs } from '@/lib/dashboard/queries';

export const metadata = { title: 'Calls · BizComms' };

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const session = await requireOrganization();
  const [{ welcome }, calls, stats, org] = await Promise.all([
    searchParams,
    listCallLogs(session.supabase),
    getMonthStats(session.supabase),
    getOrganizationDetails(session.supabase, session.organizationId),
  ]);

  return (
    <>
      <AutoRefresh />
      {welcome ? (
        <Alert variant="success">
          You&apos;re live. Calls to your new number ring your phone, and anyone you miss gets a text back.
        </Alert>
      ) : null}
      <MonthStats stats={stats} />
      <CallsTable calls={calls} timezone={org.timezone} basePath="/dashboard" />
    </>
  );
}
