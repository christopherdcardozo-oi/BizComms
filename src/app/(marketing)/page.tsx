import { Plus } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { InboxDemo, ReceptionistDemo, ReviewDemo, TextBackDemo } from '@/components/marketing/demo-cards';
import { Pricing } from '@/components/marketing/pricing';
import { WhyUs } from '@/components/marketing/why-us';
import { Button } from '@/components/ui/button';
import { pricing, siteConfig } from '@/lib/site';

export const metadata = {
  title: `${siteConfig.name} · Never lose a job to a missed call`,
  description: 'Missed-call text-back, an AI receptionist and Google review replies for plumbers, HVAC techs, electricians, roofers and cleaners.',
};

const i = (n: number) => ({ '--i': n }) as CSSProperties;

const PRODUCTS = [
  {
    name: 'Missed-call text-back',
    body: "Calls ring your cell first. If you're on a job and can't pick up, the caller gets a text from your business number within seconds, and the conversation lands in one inbox you or the office can answer from.",
    demo: <InboxDemo />,
  },
  {
    name: 'AI receptionist',
    body: "After hours, or when you're up a ladder, an AI receptionist answers, gets the caller's name, callback number and what they need, and sends you a summary to call back from.",
    demo: <ReceptionistDemo />,
  },
  {
    name: 'Google review replies',
    body: 'Every new Google review gets a reply drafted for you. Thank-yous for five-star jobs can post on their own; anything critical waits for you to approve.',
    demo: <ReviewDemo />,
  },
];

const STEPS = [
  { title: 'Get a local number', body: 'Pick a number in your area code. Put it on your truck, yard signs, website and Google profile.' },
  { title: 'Your phone rings first', body: 'Every call rings your cell, so you still take the calls you can.' },
  { title: 'Nothing slips through', body: "Missed it? We text back. Busy on a job? The AI answers. New review? The reply's already written." },
];

const FAQ = [
  {
    q: 'Do I have to change my phone number?',
    a: 'No. You get an extra local number that rings the cell you already use. Put it on your truck, website and Google profile, and keep your old number too.',
  },
  {
    q: 'What happens when I’m on a job and can’t answer?',
    a: 'The caller gets a friendly text from your business number within seconds. Turn on the AI receptionist and it answers instead, takes the details, and sends you a summary.',
  },
  {
    q: 'Does the AI pretend to be a person?',
    a: 'No. It greets callers as your automated assistant and says the call may be recorded, so you stay on the right side of disclosure rules.',
  },
  {
    q: 'Is the texting compliant?',
    a: 'Every first text includes opt-out instructions, STOP and HELP are handled automatically, people who opt out are never texted again, and texting runs through carrier registration (A2P 10DLC).',
  },
  {
    q: 'Does it replace my scheduling or invoicing app?',
    a: 'No. It handles calls, texts and reviews, and runs alongside whatever you already use to schedule jobs and send invoices.',
  },
  {
    q: 'Can I review replies before they post?',
    a: 'Yes. You choose which star ratings post automatically. Everything else waits in your dashboard for you to edit and approve.',
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 md:grid-cols-[1.1fr_1fr] md:pt-24">
        <div className="stagger flex flex-col gap-6">
          <h1 style={i(0)} className="text-display">
            Never lose a job to a missed call.
          </h1>
          <p style={i(1)} className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            You can&apos;t answer the phone from a crawl space. {siteConfig.name} texts back every caller you miss, lets an AI receptionist
            pick up when you can&apos;t, and replies to your Google reviews, so the job doesn&apos;t go to the next name on Google.
          </p>
          <div style={i(2)} className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/demo">See a live demo</Link>
            </Button>
          </div>
          <p style={i(3)} className="text-sm text-muted-foreground">
            Built for plumbers, HVAC techs, electricians, roofers and cleaners. From {pricing.currency}
            {Math.min(...pricing.plans.map((p) => p.monthly))}/month, no contracts.
          </p>
        </div>
        <TextBackDemo />
      </section>

      {/* Products */}
      <section id="products" className="scroll-mt-20 border-t">
        <div className="mx-auto max-w-6xl px-4 py-24">
          <div className="mb-16 max-w-2xl">
            <h2 className="text-title">Three ways to stop losing jobs</h2>
            <p className="mt-4 text-lg text-muted-foreground">Use one or all three. One number, one inbox and one call log for the whole business.</p>
          </div>
          <div className="flex flex-col gap-20 md:gap-24">
            {PRODUCTS.map((p, n) => (
              <article key={p.name} className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
                <div className={n % 2 ? 'md:order-2' : undefined}>
                  <h3 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{p.name}</h3>
                  <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
                <div className={n % 2 ? 'flex md:order-1 md:justify-start' : 'flex md:justify-end'}>{p.demo}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <WhyUs />

      {/* How it works */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-title mb-12 max-w-2xl">How it works</h2>
          <ol className="grid gap-10 md:grid-cols-3">
            {STEPS.map((s, n) => (
              <li key={s.title} className="flex flex-col gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium tabular-nums">{n + 1}</span>
                <h3 className="font-display text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Pricing />

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-title mb-8">Questions</h2>
          <div className="divide-y rounded-2xl border">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <Plus aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 md:flex-row md:items-center md:justify-between">
          <h2 className="text-title max-w-xl">Stop sending jobs to voicemail.</h2>
          <Button asChild size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
