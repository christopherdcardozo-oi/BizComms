// AI oversight sections, shared by /dashboard/ai (real data) and /demo/ai (sample data).
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/dashboard/format';
import type { FeedItem, Permission, PermissionState, UsageMeter } from '@/lib/oversight/model';
import { cn } from '@/lib/ui/cn';

export interface PromptBlock {
  title: string;
  description: string;
  body: string;
}

export interface OversightProps {
  planName: string;
  statusLabel: string;
  usage: UsageMeter[];
  feed: FeedItem[];
  permissions: Permission[];
  prompts: PromptBlock[];
  timezone: string;
}

const STATE: Record<PermissionState, { label: string; tone: 'success' | 'secondary' | 'warning' | 'outline' | 'destructive' }> = {
  on: { label: 'On', tone: 'success' },
  off: { label: 'Off', tone: 'secondary' },
  not_in_plan: { label: 'Not in your plan', tone: 'outline' },
  coming_soon: { label: 'Not connected', tone: 'outline' },
  never: { label: 'Never', tone: 'destructive' },
};

function Meter({ m }: { m: UsageMeter }) {
  const pct = m.limit ? Math.min(100, Math.round((m.used / m.limit) * 100)) : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{m.label}</span>
      <span className="text-2xl font-semibold tabular-nums">
        {m.used.toLocaleString('en-US')}
        {m.limit ? <span className="text-base font-normal text-muted-foreground"> / {m.limit.toLocaleString('en-US')}</span> : null}
        <span className="text-sm font-normal text-muted-foreground"> {m.unit}</span>
      </span>
      {pct !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={m.label} aria-valuenow={m.used} aria-valuemin={0} aria-valuemax={m.limit ?? undefined}>
          <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {m.note ? <span className="text-xs text-muted-foreground">{m.note}</span> : null}
    </div>
  );
}

export function OversightView({ planName, statusLabel, usage, feed, permissions, prompts, timezone }: OversightProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your AI</h1>
        <p className="text-sm text-muted-foreground">
          Everything the automation did, why, what it is told, and what it is allowed to do. Nothing here is hidden from you.
        </p>
        <nav aria-label="On this page" className="mt-2 flex flex-wrap gap-3 text-sm">
          {[
            ['#usage', 'Plan usage'],
            ['#activity', 'Activity'],
            ['#permissions', 'What it can do'],
            ['#instructions', 'What it is told'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="font-medium text-primary underline-offset-4 hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Card id="usage">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            {planName} plan <Badge variant="secondary">{statusLabel}</Badge>
          </CardTitle>
          <CardDescription>This month so far.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {usage.map((m) => (
            <Meter key={m.label} m={m} />
          ))}
        </CardContent>
      </Card>

      <Card id="activity">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>What the AI and automation did, step by step, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {feed.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing yet. Calls, texts and reviews will show up here as they happen.</p>
          ) : (
            <ol className="divide-y">
              {feed.map((item, i) => (
                <li key={`${item.at}-${i}`} className="flex flex-col gap-2 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {item.href ? (
                        <Link href={item.href} className="underline-offset-4 hover:underline">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                      {item.urgent ? <Badge variant="destructive">Urgent</Badge> : null}
                      <Badge variant="outline">{item.kind === 'call' ? 'Call' : item.kind === 'review' ? 'Review' : 'Text to you'}</Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(item.at, timezone)}</span>
                  </div>
                  {item.steps.length ? (
                    <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
                      {item.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card id="permissions">
        <CardHeader>
          <CardTitle>What it can do</CardTitle>
          <CardDescription>What the AI and automation are allowed to do right now. &quot;Never&quot; items are built-in rules no setting can turn on.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {permissions.map((p) => (
              <li key={p.label} className="flex items-start justify-between gap-4 px-6 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.detail}
                    {p.href && (p.state === 'on' || p.state === 'off') ? (
                      <>
                        {' '}
                        <Link href={p.href} className="text-primary underline-offset-4 hover:underline">
                          Change
                        </Link>
                      </>
                    ) : null}
                  </span>
                </div>
                <Badge variant={STATE[p.state].tone} className="shrink-0">
                  {STATE[p.state].label}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card id="instructions">
        <CardHeader>
          <CardTitle>What it is told</CardTitle>
          <CardDescription>
            The exact instructions the AI works from. AI models don&apos;t have hidden thoughts to show; this, plus every transcript, is the complete
            picture.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {prompts.map((p) => (
            <details key={p.title} className="rounded-md border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                {p.title} <span className="font-normal text-muted-foreground">· {p.description}</span>
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-sans text-sm leading-relaxed">
                {p.body}
              </pre>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function CallDecisions({ steps }: { steps: string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">What happened</h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </section>
  );
}
