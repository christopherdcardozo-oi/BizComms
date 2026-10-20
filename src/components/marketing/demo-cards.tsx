import type { CSSProperties } from 'react';
import { Stars } from '@/components/ui/stars';
import { cn } from '@/lib/ui/cn';

// Explanatory marketing motion (plays once on load): messages arrive in sequence to show how a
// missed call turns into a conversation. Opacity-only when the visitor prefers reduced motion.
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Bubble({ from, children, at }: { from: 'business' | 'customer'; children: React.ReactNode; at: number }) {
  return (
    <div className={cn('flex animate-message-in', from === 'business' ? 'justify-end' : 'justify-start')} style={delay(at)}>
      <p
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug',
          from === 'business' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'
        )}
      >
        {children}
      </p>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'amber' | 'emerald' | 'primary'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'amber' && 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
        tone === 'emerald' && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
        tone === 'primary' && 'bg-primary/15 text-blue-800 dark:text-blue-200'
      )}
    >
      {children}
    </span>
  );
}

export function TextBackDemo() {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] border bg-card p-3 shadow-[0_28px_60px_-28px_rgba(15,23,42,0.45)]">
      <div className="rounded-[1.5rem] bg-background p-4">
        <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-sm font-medium tabular-nums">(515) 555-0142</p>
            <p className="text-xs text-muted-foreground">Customer</p>
          </div>
          <Pill tone="amber">Missed call · 2:14 PM</Pill>
        </div>
        <div className="flex flex-col gap-2" aria-label="Example text conversation">
          <Bubble from="business" at={400}>
            Hi, this is Acme Plumbing! Sorry we missed your call. How can we help? Reply STOP to opt out.
          </Bubble>
          <Bubble from="customer" at={1300}>
            My water heater is leaking. Can someone come today?
          </Bubble>
          <Bubble from="business" at={2200}>
            Yes, we have a 4pm opening. What&apos;s the address?
          </Bubble>
        </div>
      </div>
    </div>
  );
}

const panel = 'flex w-full max-w-md flex-col gap-3 rounded-2xl bg-muted/60 p-5 text-sm ring-1 ring-inset ring-border/60';

export function InboxDemo() {
  const rows = [
    { who: '(515) 555-0142', last: 'My water heater is leaking. Can someone…', when: '2:14 PM', needs: true },
    { who: '(515) 555-0177', last: 'You: We can be there Thursday at 9.', when: '11:02 AM', needs: false },
    { who: '(515) 555-0103', last: 'Thanks for getting back to me so fast!', when: 'Yesterday', needs: false },
  ];
  return (
    <div className={panel}>
      <p className="font-medium">Inbox</p>
      <ul className="flex flex-col divide-y divide-border/70">
        {rows.map((r) => (
          <li key={r.who} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium tabular-nums">
                {r.who}
                {r.needs ? <Pill tone="primary">Needs reply</Pill> : null}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">{r.last}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{r.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReceptionistDemo() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between">
        <span className="font-medium">After-hours call</span>
        <span className="text-xs tabular-nums text-muted-foreground">1m 42s</span>
      </div>
      <p className="rounded-lg bg-background px-3 py-2 text-[13px] leading-snug">
        <span className="font-medium">Summary: </span>
        Dana needs a furnace inspection before Friday. Prefers mornings. Callback (515) 555-0188.
      </p>
      <p className="text-xs text-muted-foreground">Full transcript and recording in your call log.</p>
    </div>
  );
}

export function ReviewDemo() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Jordan P.</span>
        <Stars count={5} />
      </div>
      <p className="text-[13px] leading-snug text-muted-foreground">Showed up on time and fixed it fast. Fair price too.</p>
      <p className="rounded-lg bg-background px-3 py-2 text-[13px] leading-snug">
        Thank you, Jordan! We&apos;re glad we could get it fixed quickly. We appreciate you choosing us.
      </p>
      <span className="self-start">
        <Pill tone="emerald">Posted automatically</Pill>
      </span>
    </div>
  );
}
