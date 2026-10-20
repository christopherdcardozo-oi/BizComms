import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrganization } from '@/lib/auth/session';
import { formatDateTime, formatDuration, OUTCOME_LABELS } from '@/lib/dashboard/format';
import { getCallDetail, getOrganizationDetails } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';

export const metadata = { title: 'Call details · BizComms' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const session = await requireOrganization();
  // RLS limits this to the caller's own organization; another tenant's id is simply not found.
  const [call, org] = await Promise.all([getCallDetail(session.supabase, id), getOrganizationDetails(session.supabase, session.organizationId)]);
  if (!call) notFound();

  const outcome = call.outcome ? OUTCOME_LABELS[call.outcome] : null;
  const recording = call.recording_url?.startsWith('https://') ? call.recording_url : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
        ← Calls
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3 tabular-nums">
            {formatNanp(call.from_number)}
            {outcome ? <Badge variant={outcome.tone}>{outcome.label}</Badge> : <Badge variant="outline">{call.status}</Badge>}
            {call.sms_rescued ? <Badge variant="success">Texted back</Badge> : null}
          </CardTitle>
          <CardDescription>
            {formatDateTime(call.started_at ?? call.created_at, org.timezone)} · {formatDuration(call.duration_seconds)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/inbox/${encodeURIComponent(call.from_number)}`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Text this customer
            </Link>
          </div>

          {call.ai_summary ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">AI summary</h3>
              <p className="rounded-md bg-muted px-3 py-2 text-sm">{call.ai_summary}</p>
            </section>
          ) : null}

          {recording ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Recording</h3>
              <audio controls preload="none" src={recording} className="w-full">
                <a href={recording}>Download recording</a>
              </audio>
            </section>
          ) : null}

          {call.transcript ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Transcript</h3>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-sans text-sm leading-relaxed">
                {call.transcript}
              </pre>
            </section>
          ) : null}

          {!call.ai_summary && !call.transcript ? (
            <p className="text-sm text-muted-foreground">This call didn&apos;t go to the AI receptionist, so there&apos;s no transcript.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
