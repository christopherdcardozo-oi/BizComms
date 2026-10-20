'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { startCheckout } from './actions';

export function PlanStep({ trialDays, notice }: { trialDays?: number; notice?: string }) {
  const [state, action, pending] = useActionState(startCheckout, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="rounded-lg border p-4">
        <p className="font-medium">Missed-Call Text-Back</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>A local business number that rings your phone</li>
          <li>Instant text-back to every caller you miss</li>
          <li>Shared inbox to text customers from your business number</li>
        </ul>
        {trialDays ? <p className="mt-3 text-sm font-medium">{trialDays}-day free trial · cancel anytime</p> : null}
      </div>
      {notice ? <Alert>{notice}</Alert> : null}
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Opening secure checkout…' : trialDays ? 'Start free trial' : 'Subscribe'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Payments are processed securely by Stripe.</p>
    </form>
  );
}
