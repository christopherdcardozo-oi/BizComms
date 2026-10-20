'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { pricing } from '@/lib/site';
import { cn } from '@/lib/ui/cn';
import { startCheckout } from './actions';

export function PlanStep({ trialDays, setupFee, notice }: { trialDays?: number; setupFee?: number; notice?: string }) {
  const [state, action, pending] = useActionState(startCheckout, {});
  const [planId, setPlanId] = useState(pricing.plans.find((p) => p.highlighted)?.id ?? pricing.plans[0].id);
  const plan = pricing.plans.find((p) => p.id === planId) ?? pricing.plans[0];
  const price = `${pricing.currency}${plan.monthly}`;

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Choose your plan</legend>
        {pricing.plans.map((p) => (
          <label
            key={p.id}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
              p.id === planId ? 'border-primary bg-accent' : 'hover:bg-accent'
            )}
          >
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={p.id === planId}
              onChange={() => setPlanId(p.id)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">
                {p.name} · {pricing.currency}
                {p.monthly}/month
              </span>
              <span className="text-sm text-muted-foreground">{p.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-sm text-muted-foreground">
        {trialDays ? `Free for ${trialDays} days, then ${price}/month` : `${price}/month`}
        {setupFee ? `, plus a one-time ${pricing.currency}${setupFee} setup fee` : ''}. Your subscription renews automatically each month
        until you cancel. Cancel anytime in Settings → Billing; you keep access until the end of the period you paid for.
      </p>
      {notice ? <Alert>{notice}</Alert> : null}
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Opening secure checkout…' : trialDays ? 'Start free trial' : `Subscribe to ${plan.name}`}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By subscribing you agree to the <a href="/terms" className="underline underline-offset-4">Terms</a>. Payments are processed securely by
        Stripe.
      </p>
    </form>
  );
}
