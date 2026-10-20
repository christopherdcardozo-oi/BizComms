import type { CSSProperties } from 'react';
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

export function TextBackDemo() {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] border bg-card p-3 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]">
      <div className="rounded-[1.5rem] bg-background p-4">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <div>
            <p className="text-sm font-medium">(515) 555-0142</p>
            <p className="text-xs text-muted-foreground">Customer</p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">Missed call · 2:14 PM</span>
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

export function ReceptionistDemo() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">After-hours call</span>
        <span className="text-xs text-muted-foreground">1m 42s</span>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-[13px] leading-snug">
        <span className="font-medium">Summary: </span>
        Dana needs a furnace inspection before Friday. Prefers mornings. Callback (515) 555-0188.
      </p>
      <p className="text-xs text-muted-foreground">Full transcript and recording in your call log.</p>
    </div>
  );
}

export function ReviewDemo() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Jordan P.</span>
        <span aria-label="5 out of 5 stars" className="text-amber-500">
          ★★★★★
        </span>
      </div>
      <p className="text-[13px] leading-snug text-muted-foreground">Showed up on time and fixed it fast. Fair price too.</p>
      <p className="border-l-2 border-primary pl-3 text-[13px] leading-snug">
        Thank you, Jordan! We&apos;re glad we could get it fixed quickly. We appreciate you choosing us.
      </p>
      <span className="self-start rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Posted automatically</span>
    </div>
  );
}
