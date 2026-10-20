import Link from 'next/link';
import { AutoRefresh } from '@/components/dashboard/auto-refresh';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrganization } from '@/lib/auth/session';
import { formatDateTime, formatDuration, OUTCOME_LABELS } from '@/lib/dashboard/format';
import { getMonthStats, getOrganizationDetails, listCallLogs } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';

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

      <section className="grid gap-4 sm:grid-cols-3" aria-label="This month">
        {[
          { label: 'Calls this month', value: stats.calls },
          { label: 'Missed callers texted back', value: stats.rescued },
          { label: 'Texts sent', value: stats.textsSent },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent calls</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls yet. Call your business number to try it out.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Caller</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                  <th className="py-2 pr-4 font-medium">Length</th>
                  <th className="py-2 font-medium">Text-back</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const outcome = call.outcome ? OUTCOME_LABELS[call.outcome] : null;
                  return (
                    <tr key={call.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(call.started_at ?? call.created_at, org.timezone)}</td>
                      <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                        <Link href={`/dashboard/calls/${call.id}`} className="font-medium underline-offset-4 hover:underline">
                          {formatNanp(call.from_number)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {outcome ? <Badge variant={outcome.tone}>{outcome.label}</Badge> : <Badge variant="outline">{call.status}</Badge>}
                        {call.ai_summary ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{call.ai_summary}</p> : null}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{formatDuration(call.duration_seconds)}</td>
                      <td className="py-2">{call.sms_rescued ? <Badge variant="success">Sent</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
