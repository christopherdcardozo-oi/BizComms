import { BellRing, Layers, PhoneIncoming, ShieldCheck, UserCheck, Workflow } from 'lucide-react';
import { pricing, separateToolsComparison } from '@/lib/site';

// Every claim here is something the product actually does (see tests/e2e for the proofs).
const DIFFERENCES = [
  {
    icon: Layers,
    title: 'All three jobs, one tool',
    body: 'Most businesses stitch together a texting tool, an answering service and a review platform. Here it’s one number, one inbox and one bill.',
  },
  {
    icon: PhoneIncoming,
    title: 'Your phone rings first',
    body: 'AI-only answering services pick up every call. We ring you first and only step in when you can’t answer, so regulars still reach you.',
  },
  {
    icon: Workflow,
    title: 'Nobody slips through',
    body: 'If a caller hangs up on the AI, they still get a text back. And no one ever gets texted twice for the same call.',
  },
  {
    icon: BellRing,
    title: 'Calls never get dropped',
    body: 'If anything on our side fails, your phone still rings. A missed caller still gets a text the moment we’re back.',
  },
  {
    icon: UserCheck,
    title: 'You approve the hard replies',
    body: 'Thank-yous to happy reviews can post on their own. Anything critical waits for you, so the AI never argues with a customer in public.',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance handled for you',
    body: 'STOP and HELP replies, carrier registration, and AI and recording disclosure are built in, not left for you to figure out.',
  },
];

export function WhyUs() {
  return (
    <section id="why" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="mb-14 max-w-2xl">
          <h2 className="text-title">What other tools don’t do</h2>
          <p className="mt-4 text-lg text-muted-foreground">Built for owners who are on a job, not at a desk.</p>
        </div>
        <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {DIFFERENCES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
                <Icon aria-hidden className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
                {title}
              </h3>
              <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SeparateToolsComparison() {
  const separately = separateToolsComparison.reduce((sum, t) => sum + t.low, 0);
  const complete = pricing.plans.find((p) => p.id === 'complete')!;
  return (
    <div className="mb-12 grid gap-8 rounded-2xl bg-muted/60 p-6 ring-1 ring-inset ring-border/60 md:grid-cols-[1.4fr_1fr] md:items-center md:p-8">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Buying these separately</p>
        <ul className="mt-4 flex flex-col divide-y divide-border/70 text-sm">
          {separateToolsComparison.map((t) => (
            <li key={t.label} className="flex items-center justify-between gap-4 py-2.5">
              <span>{t.label}</span>
              <span className="tabular-nums text-muted-foreground">{t.range}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Typical 2026 published price ranges for each category.</p>
      </div>
      <div className="flex flex-col gap-1 md:items-end md:text-right">
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums line-through">
            {pricing.currency}
            {separately}+
          </span>{' '}
          a month for three tools
        </p>
        <p className="font-display text-5xl font-bold tracking-tight tabular-nums">
          {pricing.currency}
          {complete.monthly}
          <span className="font-sans text-base font-normal text-muted-foreground">/month</span>
        </p>
        <p className="text-sm text-muted-foreground">for all three with {complete.name}</p>
      </div>
    </div>
  );
}
