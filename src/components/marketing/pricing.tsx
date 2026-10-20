import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { pricing } from '@/lib/site';
import { cn } from '@/lib/ui/cn';

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-title">Simple pricing</h2>
          <p className="mt-3 text-muted-foreground">
            One local business at a time, no contracts. Get {pricing.annualMonthsFree} months free when you pay yearly.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {pricing.plans.map((plan) => (
            <article
              key={plan.id}
              className={cn('relative flex flex-col gap-6 rounded-2xl border bg-card p-6', plan.highlighted && 'border-primary shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.45)]')}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">Most popular</span>
              ) : null}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.blurb}</p>
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {pricing.currency}
                  {plan.monthly}
                </span>
                <span className="text-sm text-muted-foreground">/month</span>
              </p>
              <ul className="flex flex-col gap-2.5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-primary">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-auto" variant={plan.highlighted ? 'default' : 'outline'}>
                <Link href={`/signup?plan=${plan.id}`}>Choose {plan.name}</Link>
              </Button>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Prices in USD. Plus a one-time {pricing.currency}
          {pricing.setupFee} setup fee that covers carrier registration for your texting. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
