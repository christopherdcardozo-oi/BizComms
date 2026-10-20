import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ReceptionistDemo, ReviewDemo, TextBackDemo } from '@/components/marketing/demo-cards';
import { Pricing } from '@/components/marketing/pricing';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site';

export const metadata = {
  title: `${siteConfig.name} · Never lose a customer to a missed call`,
  description: 'Missed-call text-back, an AI receptionist, and Google review replies for local service businesses.',
};

const i = (n: number) => ({ '--i': n }) as CSSProperties;

const PRODUCTS = [
  {
    name: 'Missed-call text-back',
    body: "Calls ring your phone first. If you can't pick up, the caller gets a text from your business number right away, and the conversation lands in your inbox.",
    demo: null,
  },
  {
    name: 'AI receptionist',
    body: "After hours or while you're on a job, an AI receptionist answers, takes the caller's name, number and what they need, and sends you a summary.",
    demo: <ReceptionistDemo />,
  },
  {
    name: 'Google review replies',
    body: 'Every new review gets a thoughtful reply drafted for you. Five-star thank-yous can post automatically; anything critical waits for your approval.',
    demo: <ReviewDemo />,
  },
];

const STEPS = [
  { title: 'Get a local number', body: 'Sign up and pick a number in your area code. Put it on your website, truck and Google profile.' },
  { title: 'We ring your phone first', body: 'Every call rings your cell or office line, so you still answer the calls you can.' },
  { title: 'Nothing slips through', body: "Missed it? We text back. Busy? The AI answers. Got a review? The reply's already written." },
];

const FAQ = [
  {
    q: 'Do I have to change my phone number?',
    a: "You get a new local business number, and calls to it ring the phone you already use. Many businesses put the new number on their website and Google profile and keep their old one too.",
  },
  {
    q: 'What happens when I can’t answer?',
    a: 'The caller gets a friendly text from your business number within seconds. If you turn on the AI receptionist, it can answer instead, take a message, and text you the details.',
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
          <p style={i(0)} className="text-sm font-medium text-primary">
            For plumbers, HVAC, clinics, salons and every business that runs on the phone
          </p>
          <h1 style={i(1)} className="text-display">
            Never lose a customer to a missed call.
          </h1>
          <p style={i(2)} className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            {siteConfig.name} texts back every caller you miss, answers with an AI receptionist when you can&apos;t, and replies to your
            Google reviews, so jobs stop slipping through the cracks.
          </p>
          <div style={i(3)} className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <p style={i(4)} className="text-sm text-muted-foreground">
            Set up in minutes. No hardware, no new phone.
          </p>
        </div>
        <TextBackDemo />
      </section>

      {/* Products */}
      <section id="products" className="scroll-mt-20 border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-title">Three ways to stop losing work</h2>
            <p className="mt-3 text-muted-foreground">Use one or all three. They share one dashboard, one inbox and one call log.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PRODUCTS.map((p, n) => (
              <article key={p.name} className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
                <span className="text-xs font-medium text-muted-foreground">0{n + 1}</span>
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                {p.demo ? <div className="mt-auto pt-2">{p.demo}</div> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-title mb-12 max-w-2xl">How it works</h2>
          <ol className="grid gap-10 md:grid-cols-3">
            {STEPS.map((s, n) => (
              <li key={s.title} className="flex flex-col gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium tabular-nums">{n + 1}</span>
                <h3 className="font-semibold tracking-tight">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 text-sm sm:grid-cols-3">
          {[
            ['Calls never get dropped', 'If anything on our side fails, your phone still rings. Missed callers still get a text.'],
            ['Compliance built in', 'Opt-outs, carrier registration, and AI and recording disclosure are handled for you.'],
            ['Your data stays yours', 'Each business’s data is isolated, and connected Google accounts are encrypted.'],
          ].map(([title, body]) => (
            <div key={title} className="flex flex-col gap-2">
              <h3 className="font-semibold tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
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
                  <span aria-hidden className="text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-45">
                    +
                  </span>
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
          <h2 className="text-title max-w-xl">Stop sending customers to voicemail.</h2>
          <Button asChild size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
