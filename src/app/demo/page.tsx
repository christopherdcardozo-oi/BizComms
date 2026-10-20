import { CallsTable, MonthStats } from '@/components/dashboard/views';
import { buildDemoData } from '@/lib/demo/data';

export const dynamic = 'force-dynamic'; // timestamps stay relative to "now"

export default function DemoCallsPage() {
  const { calls, stats, business } = buildDemoData();
  return (
    <>
      <MonthStats stats={stats} />
      <CallsTable calls={calls} timezone={business.timezone} basePath="/demo" />
    </>
  );
}
