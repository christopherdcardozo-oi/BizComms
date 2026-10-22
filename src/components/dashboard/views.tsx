// Presentational dashboard views shared by the real dashboard (/dashboard, data from Supabase)
// and the public demo (/demo, sample data). They take plain data and a base path; no data access.
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Conversation, InboxMessage } from '@/lib/dashboard/conversations';
import { formatDateTime, formatDuration, OUTCOME_LABELS } from '@/lib/dashboard/format';
import type { CallDetail, CallLogRow } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';
import { cn } from '@/lib/ui/cn';

export function MonthStats({ stats }: { stats: { calls: number; rescued: number; textsSent: number; recoveredCents?: number } }) {
  const cards = [
    { label: 'Calls this month', value: String(stats.calls) },
    { label: 'Missed callers texted back', value: String(stats.rescued) },
    { label: 'Texts sent', value: String(stats.textsSent) },
    ...(stats.recoveredCents !== undefined
      ? [{ label: 'Recovered (jobs you logged)', value: `$${Math.round(stats.recoveredCents / 100).toLocaleString('en-US')}` }]
      : []),
  ];
  return (
    <section className={cn('grid gap-4 sm:grid-cols-3', cards.length === 4 && 'sm:grid-cols-2 lg:grid-cols-4')} aria-label="This month">
      {cards.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardDescription>{s.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

export function CallsTable({ calls, timezone, basePath }: { calls: CallLogRow[]; timezone: string; basePath: string }) {
  return (
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
                    <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(call.started_at ?? call.created_at, timezone)}</td>
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                      <Link href={`${basePath}/calls/${call.id}`} className="font-medium underline-offset-4 hover:underline">
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
  );
}

export function ConversationList({ conversations, timezone, basePath }: { conversations: Conversation[]; timezone: string; basePath: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {conversations.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No texts yet. When a caller you missed texts back, the conversation shows up here.
          </p>
        ) : (
          <ul className="divide-y">
            {conversations.map((c) => (
              <li key={c.contact}>
                <Link
                  href={`${basePath}/inbox/${encodeURIComponent(c.contact)}`}
                  className="flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-accent"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 font-medium tabular-nums">
                      {formatNanp(c.contact)}
                      {c.awaitingReply ? <Badge>Needs reply</Badge> : null}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {c.lastMessage.direction === 'inbound' ? '' : 'You: '}
                      {c.lastMessage.body}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.lastMessage.created_at, timezone)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ThreadHeader({ contact, optedOut, basePath }: { contact: string; optedOut: boolean; basePath: string }) {
  return (
    <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
      <div className="flex items-center gap-3">
        <Link href={`${basePath}/inbox`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Inbox
        </Link>
        <CardTitle className="tabular-nums">{formatNanp(contact)}</CardTitle>
      </div>
      {optedOut ? <Badge variant="destructive">Opted out</Badge> : null}
    </CardHeader>
  );
}

export function MessageThread({ messages, timezone }: { messages: InboxMessage[]; timezone: string }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Messages">
      {messages.map((m) => {
        const inbound = m.direction === 'inbound';
        return (
          <li key={m.id} className={cn('flex flex-col gap-1', inbound ? 'items-start' : 'items-end')}>
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                inbound ? 'bg-muted' : 'bg-primary text-primary-foreground'
              )}
            >
              {m.body}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(m.created_at, timezone)}
              {!inbound && m.type === 'missed_call_auto_reply' ? ' · automatic text-back' : ''}
              {m.status === 'failed' || m.status === 'undelivered' ? ' · not delivered' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export const OPTED_OUT_REASON = 'This customer replied STOP. You can text them again only after they text START.';

export function CallDetailView({ call, timezone, basePath }: { call: CallDetail; timezone: string; basePath: string }) {
  const outcome = call.outcome ? OUTCOME_LABELS[call.outcome] : null;
  const recording = call.recording_url?.startsWith('https://') ? call.recording_url : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href={basePath} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Calls
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3 tabular-nums">
            {formatNanp(call.from_number)}
            {outcome ? <Badge variant={outcome.tone}>{outcome.label}</Badge> : <Badge variant="outline">{call.status}</Badge>}
            {call.sms_rescued ? <Badge variant="success">Texted back</Badge> : null}
          </CardTitle>
          <CardDescription>
            {formatDateTime(call.started_at ?? call.created_at, timezone)} · {formatDuration(call.duration_seconds)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${basePath}/inbox/${encodeURIComponent(call.from_number)}`}
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
