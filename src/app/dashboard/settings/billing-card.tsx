'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { openBillingPortal } from '../actions';

export function BillingCard({
  planName,
  statusLabel,
  healthy,
  canEdit,
  forwarded,
}: {
  planName: string;
  statusLabel: string;
  healthy: boolean;
  canEdit: boolean;
  forwarded?: { used: number; limit: number; status: 'ok' | 'near' | 'over' };
}) {
  const usage = forwarded?.status ?? null;
  const [state, action, pending] = useActionState(openBillingPortal, {});
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          Billing <Badge variant={healthy ? 'success' : 'warning'}>{statusLabel}</Badge>
        </CardTitle>
        <CardDescription>
          You&apos;re on the {planName} plan. Change plans, update your card, download invoices, or cancel your subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {forwarded ? (
          <div className="flex flex-col gap-1 text-sm">
            <span>
              Forwarded call minutes this month:{' '}
              <span className="font-medium tabular-nums">
                {forwarded.used} of {forwarded.limit}
              </span>
            </span>
            {usage !== 'ok' ? (
              <span className="text-muted-foreground">
                {usage === 'over' ? 'You’re over' : 'You’re close to'} your plan&apos;s fair-use allowance. Calls keep forwarding as normal; if
                this happens often, the Receptionist plan is a better fit.
              </span>
            ) : null}
          </div>
        ) : null}
        {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
        {canEdit ? (
          <form action={action}>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? 'Opening…' : 'Manage billing'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Only owners and admins can manage billing.</p>
        )}
      </CardContent>
    </Card>
  );
}
